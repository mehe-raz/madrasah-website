import { useEffect, useState } from "react";
import { Badge } from "../components/Badge";
import { HudSpinner } from "../components/HudSpinner";
import { C } from "../theme/colors";
import { api } from "../lib/api";
import { useLanguage } from "../context/AppSettingsContext";
import type { AdmissionApplication } from "../types";

const STATUS_OPTIONS = ["Pending", "Reviewed", "Admitted", "Rejected"] as const;

const STATUS_COLOR: Record<string, string> = {
  Pending: C.amber,
  Reviewed: C.sky,
  Admitted: C.emerald,
  Rejected: C.rose,
};

const STATUS_LABEL: Record<string, string> = {
  Pending: "অপেক্ষমান",
  Reviewed: "পর্যালোচিত",
  Admitted: "ভর্তি হয়েছে",
  Rejected: "বাতিল",
};

export function AdmissionsReview() {
  const { t } = useLanguage();
  const [rows, setRows] = useState<AdmissionApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const load = () => {
    setLoading(true);
    api
      .getAdmissions()
      .then((data) => {
        setRows(data);
        setLoadError(false);
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const changeStatus = async (id: number, status: string) => {
    setUpdatingId(id);
    try {
      const updated = await api.updateAdmissionStatus(id, status);
      setRows((prev) => prev.map((r) => (r.id === id ? updated : r)));
    } catch {
      setLoadError(true);
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 900, color: C.text, margin: 0 }}>ভর্তির আবেদনসমূহ</h2>
          <p style={{ fontSize: 13, color: C.muted, margin: "6px 0 0", lineHeight: 1.7, maxWidth: 760 }}>
            পাবলিক ভর্তি ফর্ম থেকে জমা হওয়া আবেদনগুলো — স্ট্যাটাস পরিবর্তন করে পর্যালোচনা রেকর্ড করুন।
          </p>
        </div>
      </div>

      {loadError && (
        <div style={{ color: C.rose, background: C.roseL, borderRadius: 8, padding: 10, marginBottom: 16, fontSize: 13 }}>
          {t.common.requestFailed}
        </div>
      )}

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 24 }}>
          <HudSpinner size={32} />
        </div>
      ) : rows.length === 0 ? (
        <div
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 16,
            padding: 32,
            textAlign: "center",
            color: C.muted,
            fontSize: 13,
          }}
        >
          কোনো আবেদন এখনো জমা হয়নি।
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {rows.map((row) => (
            <div
              key={row.id}
              style={{
                background: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: 14,
                padding: 16,
                display: "flex",
                flexWrap: "wrap",
                gap: 14,
                alignItems: "flex-start",
                justifyContent: "space-between",
              }}
            >
              <div style={{ minWidth: 220, flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 900, fontSize: 15, color: C.text }}>{row.studentName}</span>
                  <Badge label={STATUS_LABEL[row.status] || row.status} color={STATUS_COLOR[row.status] || C.slate} />
                </div>
                <div style={{ marginTop: 6, fontSize: 13, color: C.muted, lineHeight: 1.8 }}>
                  ক্লাস: {row.className} &nbsp;•&nbsp; অভিভাবক: {row.guardianName} &nbsp;•&nbsp; ফোন: {row.guardianPhone}
                  {row.presentAddress ? <> &nbsp;•&nbsp; ঠিকানা: {row.presentAddress}</> : null}
                </div>
                {row.note && <div style={{ marginTop: 4, fontSize: 12, color: C.muted }}>মন্তব্য: {row.note}</div>}
                <div style={{ marginTop: 4, fontSize: 11, color: C.muted }}>{String(row.createdAt).slice(0, 10)}</div>
              </div>

              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {STATUS_OPTIONS.filter((s) => s !== row.status).map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={updatingId === row.id}
                    onClick={() => changeStatus(row.id, s)}
                    style={{
                      border: `1px solid ${C.border}`,
                      background: C.slateL,
                      color: C.text,
                      borderRadius: 10,
                      padding: "8px 12px",
                      fontSize: 12,
                      fontWeight: 800,
                      cursor: updatingId === row.id ? "wait" : "pointer",
                    }}
                  >
                    {STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
