// docs/OWN_SIM_BULK_SMS_GATEWAY_PLAN.md, Phase 5 — manual name+phone
// contact list UI for the own-SIM bulk SMS gateway. Deliberately unrelated
// to students/guardian data (plan doc's design decision #2) — a standalone
// list anyone can be added to. Manual add/delete only in this phase (no
// CSV/bulk import, not requested — server route also doesn't support it).
//
// Kept as its own component/file rather than folded into BulkSmsGateway.tsx
// — the plan's Phase 6 note leaves the final module structure (one tabbed
// module vs separate files) an open decision; this stays a self-contained
// piece either way, importable from wherever Phase 6 assembles it.
import { useEffect, useState } from "react";
import { Button, Card, Field, Input } from "../components/ui";
import { SkeletonCardList } from "../components/Skeleton";
import { useLanguage } from "../context/AppSettingsContext";
import { api } from "../lib/api";
import type { SmsContact } from "../types";

export function SmsContactsManager() {
  const { t } = useLanguage();
  const c = t.bulkSms;

  const [contacts, setContacts] = useState<SmsContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [groupName, setGroupName] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");

  const [busyId, setBusyId] = useState<number | null>(null);

  const load = () => {
    setLoading(true);
    setError("");
    api
      .getSmsContacts()
      .then(setContacts)
      .catch((err) => setError(err instanceof Error ? err.message : c.contactsLoadFailed))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() intentionally sets loading=true immediately so the page shows a loading state right away; the rest of its state updates land after the request resolves
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const add = async () => {
    if (!name.trim() || !phone.trim()) {
      setAddError(c.contactValidation);
      return;
    }
    setAdding(true);
    setAddError("");
    try {
      await api.createSmsContact({ name: name.trim(), phone: phone.trim(), groupName: groupName.trim() || undefined });
      setName("");
      setPhone("");
      setGroupName("");
      load();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : c.contactAddFailed);
    } finally {
      setAdding(false);
    }
  };

  const remove = async (contact: SmsContact) => {
    if (!window.confirm(c.contactDeleteConfirm)) return;
    setBusyId(contact.id);
    try {
      await api.deleteSmsContact(contact.id);
      load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <h2 className="page-title">{c.contactsTitle}</h2>
      <p className="page-subtitle">{c.contactsSubtitle}</p>

      <Card>
        <h3 className="page-header__title">{c.contactFormTitle}</h3>
        {addError && <div className="alert alert--rose">{addError}</div>}
        <div className="form-grid">
          <Field label={c.contactNameLabel}>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={c.contactNamePlaceholder} />
          </Field>
          <Field label={c.contactPhoneLabel}>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={c.contactPhonePlaceholder} />
          </Field>
          <Field label={c.contactGroupLabel}>
            <Input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder={c.contactGroupPlaceholder} />
          </Field>
        </div>
        <Button variant="sky" solid onClick={add} disabled={adding}>
          {adding ? c.contactAdding : c.contactAdd}
        </Button>
      </Card>

      {loading && <SkeletonCardList count={3} lines={1} />}
      {!loading && error && <div className="alert alert--rose">{error}</div>}

      {!loading && !error && (
        <div className="sms-contact-list">
          <div className="sms-contact-header">
            <span>{c.contactNameLabel}</span>
            <span>{c.contactPhoneLabel}</span>
            <span>{c.contactGroupLabel}</span>
            <span />
          </div>
          {contacts.length === 0 && <p className="page-subtitle">{c.contactsEmpty}</p>}
          {contacts.map((contact) => (
            <div key={contact.id} className="sms-contact-row">
              <span className="sms-contact-row__name">{contact.name}</span>
              <span className="sms-contact-row__meta">{contact.phone}</span>
              <span className="sms-contact-row__meta">{contact.groupName || "—"}</span>
              <Button
                variant="rose"
                onClick={() => remove(contact)}
                disabled={busyId === contact.id}
                className="sms-contact-row__delete"
                aria-label={c.contactDelete}
              >
                {c.contactDelete}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
