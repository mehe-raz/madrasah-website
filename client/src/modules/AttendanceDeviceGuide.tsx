// docs/ATTENDANCE_DEVICE_SELFSERVICE_PLAN.md, Phase 4A + 4B — in-app,
// step-by-step setup guide for connecting a fingerprint/card attendance
// device end-to-end. Reachable from AttendanceDevices.tsx ("গাইড দেখুন").
//
// Phase 4B visual decision: icon-based numbered steps (lucide icons already
// in lib/icons.ts), not literal screenshots — screenshots can't be taken
// from this sandbox, and the plan doc (section 3) offered this as the
// no-new-asset option. If real screenshots are wanted later, they can be
// dropped into a small image slot per step without changing this structure.
import type { LucideIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button, Card } from "../components/ui";
import { useLanguage } from "../context/AppSettingsContext";
import { Icons } from "../lib/icons";

function Step({
  number,
  icon: Icon,
  title,
  body,
  note,
}: {
  number: number;
  icon: LucideIcon;
  title: string;
  body: string;
  note?: string;
}) {
  return (
    <Card tight className="device-guide__step">
      <div className="device-guide__step-num">{number}</div>
      <div>
        <div className="device-guide__step-title">
          <Icon size={16} aria-hidden="true" className="device-guide__step-icon" />
          {title}
        </div>
        <p className="device-guide__step-body">{body}</p>
        {note && <div className="device-guide__note">{note}</div>}
      </div>
    </Card>
  );
}

export function AttendanceDeviceGuide() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const g = t.attendanceDeviceGuide;

  const kioskUrl = `${window.location.origin}/kiosk/${g.kioskUrlPlaceholder}`;

  return (
    <div>
      <div className="device-guide__topbar">
        <Button variant="outline" onClick={() => navigate("/attendance-devices")}>
          <Icons.chevronLeft size={16} aria-hidden="true" /> {g.back}
        </Button>
      </div>

      <h2 className="page-title">{g.title}</h2>
      <p className="page-subtitle">{g.subtitle}</p>

      <Step number={1} icon={Icons.add} title={g.step1Title} body={g.step1Body} />
      <Step number={2} icon={Icons.bridge} title={g.step2Title} body={g.step2Body} note={g.step2Note} />
      <Step number={3} icon={Icons.fingerprint} title={g.step3Title} body={g.step3Body} />
      <Step number={4} icon={Icons.kiosk} title={g.step4Title} body={g.step4Body} />

      <Card tight className="device-guide__step">
        <div className="device-guide__step-num">
          <Icons.checkCircle size={18} aria-hidden="true" />
        </div>
        <div>
          <div className="ds-label">{g.kioskUrlLabel}</div>
          <div className="ds-readonly ds-readonly--mono">{kioskUrl}</div>
          <p className="device-guide__step-body device-guide__step-body--spaced">{g.doneNote}</p>
        </div>
      </Card>
    </div>
  );
}
