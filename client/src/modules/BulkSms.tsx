// docs/OWN_SIM_BULK_SMS_GATEWAY_PLAN.md, Phase 6 — final module structure
// decided in the plan doc: one module (`/bulk-sms` route) with three
// sections/tabs — গেটওয়ে কানেক্ট (Phase 4, BulkSmsGateway.tsx), কন্টাক্ট
// (Phase 5, SmsContactsManager.tsx), and কম্পোজ ও পাঠান (this Phase, below).
// Kept as three tabs on one page (not three separate routes) because the
// plan doc explains they're used together in one flow: connect → add
// contacts → send.
import { useEffect, useState } from "react";
import { Badge } from "../components/Badge";
import { SkeletonCardList } from "../components/Skeleton";
import { Button, Card, Field, Textarea } from "../components/ui";
import { useLanguage } from "../context/AppSettingsContext";
import { api } from "../lib/api";
import { Icons, type IconKey } from "../lib/icons";
import type { SmsContact } from "../types";
import { BulkSmsGateway } from "./BulkSmsGateway";
import { SmsContactsManager } from "./SmsContactsManager";

type Tab = "gateway" | "contacts" | "compose";

// Replaces both {নাম} and {name} for the live preview line — must match
// server/src/routes/sms.js's personalize() exactly (bn/en placeholder
// support, plan doc design decision #4).
function personalize(template: string, name: string) {
  return template.split("{নাম}").join(name).split("{name}").join(name);
}

function ComposeSection() {
  const { t } = useLanguage();
  const c = t.bulkSms;

  const [gatewayConnected, setGatewayConnected] = useState<boolean | null>(null);
  const [contacts, setContacts] = useState<SmsContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [message, setMessage] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [summary, setSummary] = useState<{ total: number; sent: number; failed: number } | null>(null);

  const load = () => {
    setLoading(true);
    setLoadError("");
    Promise.all([api.getOwnSmsGatewayStatus(), api.getSmsContacts()])
      .then(([status, list]) => {
        setGatewayConnected(status.connected);
        setContacts(list);
        setSelectedIds(new Set(list.map((contact) => contact.id)));
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : c.composeLoadFailed))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() intentionally sets loading=true immediately so the page shows a loading state right away; the rest of its state updates land after the request resolves
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allSelected = contacts.length > 0 && selectedIds.size === contacts.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  const toggleAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(contacts.map((contact) => contact.id)));
  };

  const toggleOne = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const previewName = contacts.find((contact) => selectedIds.has(contact.id))?.name;

  const send = async () => {
    if (!message.trim() || selectedIds.size === 0) return;
    const confirmed = window.confirm(c.composeConfirm.replace("{count}", String(selectedIds.size)));
    if (!confirmed) return;

    setSending(true);
    setSendError("");
    setSummary(null);
    try {
      const result = await api.sendSmsBroadcast({
        contactIds: allSelected ? "all" : Array.from(selectedIds),
        message: message.trim(),
      });
      setSummary(result);
      setMessage("");
    } catch (err) {
      setSendError(err instanceof Error ? err.message : c.composeSendFailed);
    } finally {
      setSending(false);
    }
  };

  if (loading) return <SkeletonCardList count={2} lines={2} />;
  if (loadError) return <div className="alert alert--rose">{loadError}</div>;

  return (
    <div>
      {gatewayConnected === false && <div className="alert alert--amber">{c.composeGatewayNotConnected}</div>}

      <Card>
        <Field label={c.composeMessageLabel}>
          <Textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={c.composeMessagePlaceholder} />
        </Field>
        <p className="page-subtitle">{c.composePlaceholderHint}</p>
        {previewName && message.trim() && (
          <div className="alert alert--sky">
            {c.composePreviewLabel}: {personalize(message, previewName)}
          </div>
        )}
      </Card>

      <Card>
        <div className="sms-balance">
          <h3 className="page-header__title">{c.composeRecipientsTitle}</h3>
          <Badge label={`${selectedIds.size}/${contacts.length}`} color="#0ea5e9" />
        </div>

        {contacts.length === 0 && <p className="page-subtitle">{c.composeNoContacts}</p>}

        {contacts.length > 0 && (
          <>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someSelected;
                }}
                onChange={toggleAll}
              />
              {c.composeSelectAll}
            </label>
            <div className="sms-recipient-list">
              {contacts.map((contact) => (
                <label key={contact.id} className="checkbox-row sms-recipient-row">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(contact.id)}
                    onChange={() => toggleOne(contact.id)}
                    aria-label={`${contact.name} — ${contact.phone}`}
                  />
                  <span className="sms-contact-row__name">{contact.name}</span>
                  <span className="sms-contact-row__meta">{contact.phone}</span>
                </label>
              ))}
            </div>
          </>
        )}
      </Card>

      {sendError && <div className="alert alert--rose">{sendError}</div>}
      {summary && (
        <div className="alert alert--emerald">
          {c.composeSummary.replace("{total}", String(summary.total)).replace("{sent}", String(summary.sent)).replace("{failed}", String(summary.failed))}
        </div>
      )}

      <Button
        variant="sky"
        solid
        onClick={send}
        disabled={sending || !gatewayConnected || !message.trim() || selectedIds.size === 0}
      >
        {sending ? c.composeSending : c.composeSend}
      </Button>
    </div>
  );
}

export function BulkSms() {
  const { t } = useLanguage();
  const c = t.bulkSms;
  const [tab, setTab] = useState<Tab>("gateway");

  const tabs: { id: Tab; label: string; icon: IconKey }[] = [
    { id: "gateway", label: c.tabGateway, icon: "bulkSms" },
    { id: "contacts", label: c.tabContacts, icon: "students" },
    { id: "compose", label: c.tabCompose, icon: "chat" },
  ];

  return (
    <div>
      <div className="bulk-sms-tabs">
        {tabs.map((item) => {
          const Icon = Icons[item.icon];
          return (
            <Button
              key={item.id}
              variant={tab === item.id ? "sky" : "outline"}
              solid={tab === item.id}
              onClick={() => setTab(item.id)}
            >
              <Icon size={14} aria-hidden="true" /> {item.label}
            </Button>
          );
        })}
      </div>

      {tab === "gateway" && <BulkSmsGateway />}
      {tab === "contacts" && <SmsContactsManager />}
      {tab === "compose" && <ComposeSection />}
    </div>
  );
}
