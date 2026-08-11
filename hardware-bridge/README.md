# Attendance Device Bridge (Phase 5 — unverified/generic)

Standalone Node.js service that receives punch data from a fingerprint
device and forwards it to `POST /api/device/punch` on the main
madrasah-website server. This is **separate from the main app** — its own
`package.json`/`npm install`, its own process, meant to run on a small
always-on machine near the device (not as part of the website deploy).

## Status: generic, not yet tested against real hardware

This was written before a specific device brand/model was chosen
(`docs/ATTENDANCE_DEVICE_PLAN.md`, Phase 5). It implements the commonly
documented "push/ADMS" protocol shape that many budget fingerprint
devices (ZKTeco and OEM/clone devices on similar firmware) use — but the
exact wire format can differ per device/firmware, so **treat this as a
starting point, not a guarantee.**

Every request the bridge receives is logged to `raw-requests.log` (method,
URL, headers, body). Once you have the real device talking to this bridge,
that file is the fastest way to see exactly what it's sending and adjust
`index.js` to match — send that log along if you want help adjusting it.

## Setup

1. `cd hardware-bridge && npm install`
2. `cp .env.example .env` and fill in:
   - `MADRASAH_API_BASE` — your running server's API URL
   - `DEVICE_ID` / `DEVICE_SECRET` — create a device from the admin
     dashboard's device management page first (Phase 2); the secret is
     only shown once at creation/regeneration time
   - `BRIDGE_PORT` — whatever's free on the machine this runs on
3. `npm start`
4. On the physical device's own menu (usually under
   Network/Communication/Cloud settings), set its "Server IP" and "Server
   Port" (or "ADMS" toggle, wording varies by device) to point at the
   machine running this bridge and `BRIDGE_PORT`.
5. Scan a test fingerprint/card and watch the bridge's console output +
   `raw-requests.log`. If nothing shows up at all, the device likely isn't
   even reaching this bridge (network/firewall, or it uses a different
   protocol entirely — see "If this doesn't work" below).

## Matching PIN to a student

The device identifies a person by a "PIN" (its own internal enrollment
number). Whatever PIN the device sends must be typed **exactly**, character
for character, into that student's `fingerprintId` field on the admin
dashboard (Students module) — this bridge does no translation between the
two, per the Phase 1 plan's manual-enrollment decision.

## If this doesn't work with your actual device

Some devices don't speak push/ADMS at all — common alternatives once you
know the real brand/model:
- **Pull/SDK-based** device (most non-push ZKTeco-family devices): needs a
  different bridge design (this one connects TO the device instead of
  waiting for it), usually over a local TCP SDK — a different piece of
  code, not a tweak of this file.
- **Keyboard-emulation card reader**: doesn't need this bridge at all — see
  the "known gap" note in `client/src/pages/kiosk/Kiosk.tsx`'s Phase 4
  section; a hidden input on the kiosk page can capture the scan directly.

Once the real brand/model is known, bring it up again — the plan doc's
Phase 5 section can be updated with the actual protocol and this bridge
adjusted or replaced accordingly.
