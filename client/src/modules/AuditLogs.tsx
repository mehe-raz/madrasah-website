import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "../components/Badge";
import { HudSpinner } from "../components/HudSpinner";
import { SkeletonTableRows } from "../components/Skeleton";
import { useLanguage } from "../context/AppSettingsContext";
import { api } from "../lib/api";
import { C } from "../theme/colors";
import type { AuditLog } from "../types";

const PAGE_SIZE = 50;

function actionColor(action: string): string {
  const prefix = action.split(".")[0];
  switch (prefix) {
    case "student":
      return C.teal;
    case "payment":
      return C.emerald;
    case "expense":
      return C.rose;
    case "user":
      return C.violet;
    case "settings":
      return C.amber;
    case "backup":
      return C.sky;
    case "delete-request":
      return C.rose;
    case "admission":
      return C.violet;
    case "site-content":
      return C.sky;
    default:
      return C.slate;
  }
}

function formatDetails(details: string): string {
  if (!details) return "";
  try {
    return JSON.stringify(JSON.parse(details), null, 2);
  } catch {
    return details;
  }
}

export function AuditLogs() {
  const { t, tr, lang } = useLanguage();
  const [items, setItems] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [actions, setActions] = useState<string[]>([]);
  const [entityTypes, setEntityTypes] = useState<string[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    api
      .getAuditLogMeta()
      .then((meta) => {
        setActions(meta.actions);
        setEntityTypes(meta.entityTypes);
      })
      .catch(() => {
        /* filters are a convenience; ignore failures */
      });
  }, []);

  // Debounce free-text search so we don't fire a request on every keystroke.
  useEffect(() => {
    const handle = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 350);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api.getAuditLogs({ page, limit: PAGE_SIZE, action, entityType, search, from, to });
      setItems(result.items);
      setTotal(result.total);
      setTotalPages(result.totalPages);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [page, action, entityType, search, from, to]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() intentionally sets loading=true immediately so the table shows a spinner right away; the rest of its state updates land after the request resolves
    load();
  }, [load]);

  const hasFilters = !!(action || entityType || search || from || to);

  const clearFilters = () => {
    setAction("");
    setEntityType("");
    setSearchInput("");
    setSearch("");
    setFrom("");
    setTo("");
    setPage(1);
  };

  const rangeLabel = useMemo(() => {
    if (!total) return "";
    const fromIdx = (page - 1) * PAGE_SIZE + 1;
    const toIdx = Math.min(page * PAGE_SIZE, total);
    return tr("auditLogs.resultsCount", { from: fromIdx, to: toIdx, total });
  }, [page, total, tr]);

  const inputStyle = {
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    padding: "8px 10px",
    fontSize: 13,
    color: C.text,
    background: C.card,
  } as const;

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: C.text, margin: 0 }}>{t.auditLogs.title}</h2>
        <p style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>{t.auditLogs.subtitle}</p>
      </div>

      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: 14,
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          padding: 12,
        }}
      >
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={t.auditLogs.searchPlaceholder}
          style={{ ...inputStyle, flex: "1 1 220px", minWidth: 180 }}
        />
        <select
          value={action}
          onChange={(e) => {
            setAction(e.target.value);
            setPage(1);
          }}
          style={{ ...inputStyle, minWidth: 150 }}
        >
          <option value="">{t.auditLogs.allActions}</option>
          {actions.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <select
          value={entityType}
          onChange={(e) => {
            setEntityType(e.target.value);
            setPage(1);
          }}
          style={{ ...inputStyle, minWidth: 140 }}
        >
          <option value="">{t.auditLogs.allEntities}</option>
          {entityTypes.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            setPage(1);
          }}
          style={inputStyle}
          title={t.common.from}
        />
        <input
          type="date"
          value={to}
          onChange={(e) => {
            setTo(e.target.value);
            setPage(1);
          }}
          style={inputStyle}
          title={t.common.to}
        />
        <button
          type="button"
          onClick={() => load()}
          style={{ border: `1px solid ${C.border}`, background: C.card, color: C.text, borderRadius: 8, padding: "8px 14px", fontSize: 13, cursor: "pointer", fontWeight: 600 }}
        >
          {t.auditLogs.refresh}
        </button>
        {hasFilters && (
          <button
            type="button"
            onClick={clearFilters}
            style={{ border: "none", background: C.roseL, color: C.rose, borderRadius: 8, padding: "8px 14px", fontSize: 13, cursor: "pointer", fontWeight: 600 }}
          >
            {t.auditLogs.clearFilters}
          </button>
        )}
      </div>

      {error && (
        <div style={{ background: C.roseL, color: C.rose, borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 13 }}>{error}</div>
      )}

      <div className="table-wrap" style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 760 }}>
          <thead>
            <tr style={{ background: C.slateL }}>
              {[t.auditLogs.time, t.auditLogs.actor, t.auditLogs.action, t.auditLogs.entityType, t.auditLogs.label, ""].map((h) => (
                <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: C.muted, fontWeight: 600, fontSize: 12, borderBottom: `1px solid ${C.border}` }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && items.length === 0 && <SkeletonTableRows rows={8} columns={6} />}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: 24, textAlign: "center", color: C.muted }}>
                  {t.auditLogs.noResults}
                </td>
              </tr>
            )}
            {items.map((log, i) => {
              const isOpen = expandedId === log.id;
              const detailsText = formatDetails(log.details);
              return (
                <Fragment key={log.id}>
                  <tr style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? C.card : "var(--row-alt)" }}>
                    <td style={{ padding: "10px 14px", color: C.muted, whiteSpace: "nowrap" }}>
                      {new Date(log.createdAt).toLocaleString(lang === "en" ? "en-US" : "bn-BD")}
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <div style={{ fontWeight: 600, color: C.text }}>{log.actorName || "—"}</div>
                      <div style={{ color: C.muted, fontSize: 11 }}>{log.actorRole}</div>
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <Badge label={log.action} color={actionColor(log.action)} />
                    </td>
                    <td style={{ padding: "10px 14px", color: C.muted }}>{log.entityType || "—"}</td>
                    <td style={{ padding: "10px 14px" }}>{log.label || "—"}</td>
                    <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                      {detailsText && (
                        <button
                          type="button"
                          onClick={() => setExpandedId(isOpen ? null : log.id)}
                          style={{ background: C.skyL, color: C.skyD, border: "none", borderRadius: 6, padding: "4px 8px", fontSize: 11, cursor: "pointer" }}
                        >
                          {isOpen ? t.auditLogs.hideDetails : t.auditLogs.viewDetails}
                        </button>
                      )}
                    </td>
                  </tr>
                  {isOpen && detailsText && (
                    <tr style={{ background: "var(--row-alt)" }}>
                      <td colSpan={6} style={{ padding: "0 14px 14px" }}>
                        <pre
                          style={{
                            margin: 0,
                            background: C.slateL,
                            color: C.text,
                            borderRadius: 8,
                            padding: 12,
                            fontSize: 12,
                            overflowX: "auto",
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                          }}
                        >
                          {detailsText}
                        </pre>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
        <div style={{ color: C.muted, fontSize: 12, display: "flex", alignItems: "center" }}>
          {loading ? <HudSpinner size={16} /> : rangeLabel}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            style={{ border: `1px solid ${C.border}`, background: C.card, color: page <= 1 ? C.muted : C.text, borderRadius: 6, padding: "6px 10px", cursor: page <= 1 ? "not-allowed" : "pointer", fontSize: 12 }}
          >
            Prev
          </button>
          <span style={{ color: C.muted, fontSize: 12 }}>{tr("auditLogs.page", { page, totalPages })}</span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            style={{ border: `1px solid ${C.border}`, background: C.card, color: page >= totalPages ? C.muted : C.text, borderRadius: 6, padding: "6px 10px", cursor: page >= totalPages ? "not-allowed" : "pointer", fontSize: 12 }}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
