// docs/CCTV_INTEGRATION_PLAN.md, Phase 7 — reusable single-camera HLS feed.
// Uses hls.js for broad browser support (Chrome, Firefox, Edge); falls back
// to the browser's native HLS player on Safari. Fetches a short-lived signed
// stream URL from GET /cameras/:id/stream-url (Phase 4) so the actual bridge
// tunnel URL is never exposed to the client directly.

import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { api } from "../lib/api";
import { C } from "../theme/colors";
import { useLanguage } from "../context/AppSettingsContext";

export interface CameraFeedProps {
  cameraId: number;
  name: string;
  location: string;
  active: boolean;
  /** Pixel height of the video element. Defaults to 180. */
  height?: number;
}

export function CameraFeed({ cameraId, name, location, active, height = 180 }: CameraFeedProps) {
  const { t } = useLanguage();
  const c = t.cameras;
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [streamError, setStreamError] = useState("");
  // Initial state mirrors `active` so the spinner shows immediately on mount
  // without needing a synchronous setState call inside the effect body.
  const [loading, setLoading] = useState(active);

  useEffect(() => {
    if (!active) {
      return;
    }

    let cancelled = false;
    // Copy videoRef into a local variable so the cleanup closure holds a stable
    // reference even if React reassigns the ref before cleanup runs.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- setLoading/setStreamError reset state at the start of each new fetch; the loading spinner is already visible via initial state so there is no cascading-render concern
    setLoading(true);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- same rationale as above
    setStreamError("");

    api.cameras
      .getStreamUrl(cameraId)
      .then(({ streamUrl }) => {
        if (cancelled || !videoRef.current) return;
        setLoading(false);

        if (Hls.isSupported()) {
          const hls = new Hls({
            // Disable web-worker so no extra worker file is needed in the build
            enableWorker: false,
            // Low-latency tuning: keep live playback close to the edge
            liveSyncDurationCount: 2,
          });
          hlsRef.current = hls;
          hls.loadSource(streamUrl);
          hls.attachMedia(videoRef.current);
          hls.on(Hls.Events.ERROR, (_evt, data) => {
            if (data.fatal) {
              setStreamError(c.streamError);
              hls.destroy();
              hlsRef.current = null;
            }
          });
        } else if (videoRef.current.canPlayType("application/vnd.apple.mpegurl")) {
          // Safari — native HLS support
          videoRef.current.src = streamUrl;
        } else {
          setStreamError(c.hlsUnsupported);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoading(false);
          setStreamError(c.streamUrlFailed);
        }
      });

    return () => {
      cancelled = true;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      // Use a local variable so cleanup captures a stable DOM reference.
      const video = videoRef.current;
      if (video) {
        video.src = "";
        video.load();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraId, active]);

  return (
    <div className="camera-feed">
      {/* Header */}
      <div className="camera-feed__header">
        <span className="camera-feed__name">{name}</span>
        {location && <span className="camera-feed__location">{location}</span>}
        <span
          className="camera-feed__dot"
          // eslint-disable-next-line no-restricted-syntax -- color is runtime-computed (active state)
          style={{ background: active ? C.emerald : C.slate }}
          title={active ? c.active : c.inactive}
        />
      </div>

      {/* Video area */}
      <div
        className="camera-feed__stage"
        // eslint-disable-next-line no-restricted-syntax -- height is a runtime prop, cannot be a static class
        style={{ height }}
      >
        {!active && (
          <div className="camera-feed__overlay">{c.cameraInactive}</div>
        )}
        {active && loading && (
          <div className="camera-feed__overlay">{c.streamLoading}</div>
        )}
        {active && !loading && streamError && (
          <div className="camera-feed__overlay camera-feed__overlay--error">
            {streamError}
          </div>
        )}
        {active && (
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="camera-feed__video"
            // Hide the element while loading or in error state so the black
            // frame never flickers through
            aria-hidden={loading || !!streamError}
          />
        )}
      </div>
    </div>
  );
}
