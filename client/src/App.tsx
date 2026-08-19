import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { GuardianShell } from "./components/GuardianShell";
import { GuardianProtectedRoute } from "./components/GuardianProtectedRoute";
import { PlanFeatureGate } from "./components/PlanFeatureGate";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AuthProvider } from "./context/AuthContext";
import { GuardianAuthProvider } from "./context/GuardianAuthContext";
import { PlanProvider } from "./context/PlanContext";

const About = lazy(() => import("./pages/About").then((m) => ({ default: m.About })));
const Admission = lazy(() => import("./pages/Admission").then((m) => ({ default: m.Admission })));
const AdmissionApply = lazy(() => import("./pages/AdmissionApply").then((m) => ({ default: m.AdmissionApply })));
const ClassesCourses = lazy(() => import("./pages/ClassesCourses").then((m) => ({ default: m.ClassesCourses })));
const Gallery = lazy(() => import("./pages/Gallery").then((m) => ({ default: m.Gallery })));
const Notices = lazy(() => import("./pages/Notices").then((m) => ({ default: m.Notices })));
const Pricing = lazy(() => import("./pages/Pricing").then((m) => ({ default: m.Pricing })));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy").then((m) => ({ default: m.PrivacyPolicy })));
const ResultLookup = lazy(() => import("./pages/ResultLookup").then((m) => ({ default: m.ResultLookup })));
const TermsOfService = lazy(() => import("./pages/TermsOfService").then((m) => ({ default: m.TermsOfService })));
const Kiosk = lazy(() => import("./pages/kiosk/Kiosk").then((m) => ({ default: m.Kiosk })));
const Attendance = lazy(() => import("./modules/Attendance").then((m) => ({ default: m.Attendance })));
const AdmissionsReview = lazy(() => import("./modules/AdmissionsReview").then((m) => ({ default: m.AdmissionsReview })));
const AttendanceDevices = lazy(() => import("./modules/AttendanceDevices").then((m) => ({ default: m.AttendanceDevices })));
const Cameras = lazy(() => import("./modules/Cameras").then((m) => ({ default: m.Cameras })));
// docs/STAFF_ATTENDANCE_PLAN.md, Phase 5/6
const Staff = lazy(() => import("./modules/Staff").then((m) => ({ default: m.Staff })));
const StaffAttendance = lazy(() => import("./modules/StaffAttendance").then((m) => ({ default: m.StaffAttendance })));
const AttendanceDeviceGuide = lazy(() =>
  import("./modules/AttendanceDeviceGuide").then((m) => ({ default: m.AttendanceDeviceGuide }))
);
const AuditLogs = lazy(() => import("./modules/AuditLogs").then((m) => ({ default: m.AuditLogs })));
const BulkSms = lazy(() => import("./modules/BulkSms").then((m) => ({ default: m.BulkSms })));
const ClassPosts = lazy(() => import("./modules/ClassPosts").then((m) => ({ default: m.ClassPosts })));
const AdmitCards = lazy(() => import("./modules/AdmitCards").then((m) => ({ default: m.AdmitCards })));
const ExamCoverSheets = lazy(() => import("./modules/ExamCoverSheets").then((m) => ({ default: m.ExamCoverSheets })));
const Dashboard = lazy(() => import("./modules/Dashboard").then((m) => ({ default: m.Dashboard })));
const Expenses = lazy(() => import("./modules/Expenses").then((m) => ({ default: m.Expenses })));
const GuardianReminders = lazy(() => import("./modules/GuardianReminders").then((m) => ({ default: m.GuardianReminders })));
const HifzTracking = lazy(() => import("./modules/HifzTracking").then((m) => ({ default: m.HifzTracking })));
const Income = lazy(() => import("./modules/Income").then((m) => ({ default: m.Income })));
const PaymentGatewaySettings = lazy(() =>
  import("./modules/PaymentGatewaySettings").then((m) => ({ default: m.PaymentGatewaySettings }))
);
const Reports = lazy(() => import("./modules/Reports").then((m) => ({ default: m.Reports })));
const CallListView = lazy(() => import("./modules/reports/CallListView").then((m) => ({ default: m.CallListView })));
const Results = lazy(() => import("./modules/Results").then((m) => ({ default: m.Results })));
const Settings = lazy(() => import("./modules/Settings").then((m) => ({ default: m.Settings })));
const SmsSettings = lazy(() => import("./modules/SmsSettings").then((m) => ({ default: m.SmsSettings })));
const InstitutionBilling = lazy(() =>
  import("./modules/InstitutionBilling").then((m) => ({ default: m.InstitutionBilling }))
);
const Students = lazy(() => import("./modules/Students").then((m) => ({ default: m.Students })));
const Website = lazy(() => import("./modules/Website").then((m) => ({ default: m.Website })));
const WebsitePreview = lazy(() => import("./pages/WebsitePreview").then((m) => ({ default: m.WebsitePreview })));
const WebsiteSectionEditor = lazy(() => import("./modules/WebsiteSectionEditor").then((m) => ({ default: m.WebsiteSectionEditor })));
const Login = lazy(() => import("./pages/Login").then((m) => ({ default: m.Login })));
const ResetPassword = lazy(() => import("./pages/ResetPassword").then((m) => ({ default: m.ResetPassword })));
const GuardianLogin = lazy(() => import("./pages/guardian/GuardianLogin").then((m) => ({ default: m.GuardianLogin })));
const GuardianDashboard = lazy(() => import("./pages/guardian/GuardianDashboard").then((m) => ({ default: m.GuardianDashboard })));
const GuardianAttendance = lazy(() => import("./pages/guardian/GuardianAttendance").then((m) => ({ default: m.GuardianAttendance })));
const GuardianResults = lazy(() => import("./pages/guardian/GuardianResults").then((m) => ({ default: m.GuardianResults })));
const GuardianFeed = lazy(() => import("./pages/guardian/GuardianFeed").then((m) => ({ default: m.GuardianFeed })));
const GuardianPayFee = lazy(() => import("./pages/guardian/GuardianPayFee").then((m) => ({ default: m.GuardianPayFee })));
const GuardianPayCallback = lazy(() =>
  import("./pages/guardian/GuardianPayCallback").then((m) => ({ default: m.GuardianPayCallback }))
);

function PageFallback() {
  // Intentionally not a spinner: in-app navigation should feel like the page
  // is already there and quietly finishing up, not "loading" from scratch.
  // The HUD spinner is reserved for an actual browser reload (index.html).
  return (
    <div className="page-loading-bar" role="status" aria-live="polite">
      <span className="page-loading-bar__fill" />
    </div>
  );
}

export default function App() {
  useEffect(() => {
    // Tells the reload-only splash screen (index.html / reload-splash.js)
    // that the app shell has mounted, so it can fade out. No effect on
    // normal in-app navigation.
    window.dispatchEvent(new Event("app:ready"));
  }, []);

  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/about" element={<About />} />
            <Route path="/classes" element={<ClassesCourses />} />
            <Route path="/admission" element={<Admission />} />
            <Route path="/admission/apply" element={<AdmissionApply />} />
            <Route path="/gallery" element={<Gallery />} />
            <Route path="/notices" element={<Notices />} />
            <Route path="/result" element={<ResultLookup />} />
            <Route path="/terms" element={<TermsOfService />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/pricing" element={<Pricing />} />
            {/* Attendance device kiosk monitor (docs/ATTENDANCE_DEVICE_PLAN.md,
                Phase 4) — a tablet mounted above the device stays open on this
                URL indefinitely, so it must be public like /result above:
                no staff login, deliberately outside <ProtectedRoute>. */}
            <Route path="/kiosk/:deviceId" element={<Kiosk />} />
            <Route
              path="/guardian/*"
              element={
                <GuardianAuthProvider>
                  <Routes>
                    <Route path="login" element={<GuardianLogin />} />
                    <Route element={<GuardianProtectedRoute />}>
                      <Route element={<GuardianShell />}>
                        <Route index element={<GuardianDashboard />} />
                        <Route path="attendance" element={<GuardianAttendance />} />
                        <Route path="results" element={<GuardianResults />} />
                        <Route path="feed" element={<GuardianFeed />} />
                        <Route path="pay/callback" element={<GuardianPayCallback />} />
                        <Route path="pay/:studentId" element={<GuardianPayFee />} />
                        <Route path="*" element={<Navigate to="/guardian" replace />} />
                      </Route>
                    </Route>
                  </Routes>
                </GuardianAuthProvider>
              }
            />
            <Route element={<ProtectedRoute />}>
              <Route path="website/preview" element={<WebsitePreview />} />
              <Route element={<PlanProvider><Layout /></PlanProvider>}>
                <Route index element={<Dashboard />} />
                <Route path="students" element={<Students />} />
                <Route path="attendance" element={<Attendance />} />
                <Route
                  path="income"
                  element={
                    <PlanFeatureGate feature="feesCollection">
                      <Income />
                    </PlanFeatureGate>
                  }
                />
                <Route path="fees" element={<Navigate to="/income" replace />} />
                <Route
                  path="expenses"
                  element={
                    <PlanFeatureGate feature="expenses">
                      <Expenses />
                    </PlanFeatureGate>
                  }
                />
                <Route
                  path="hifz"
                  element={
                    <PlanFeatureGate feature="hifzTracking">
                      <HifzTracking />
                    </PlanFeatureGate>
                  }
                />
                <Route path="results" element={<Results />} />
                <Route path="admit-cards" element={<AdmitCards />} />
                <Route path="exam-cover-sheets" element={<ExamCoverSheets />} />
                <Route
                  path="assignments"
                  element={
                    <PlanFeatureGate feature="assignmentsBroadcast">
                      <ClassPosts />
                    </PlanFeatureGate>
                  }
                />
                <Route
                  path="reports"
                  element={
                    <PlanFeatureGate feature="reportsExport">
                      <Reports />
                    </PlanFeatureGate>
                  }
                />
                {/* Reports > "কল লিস্ট" full-page view (docs/CALL_LIST_PLAN.md,
                    Phase 2) — reuses the same reportsExport plan gate as
                    /reports above; the underlying student data itself is
                    already gated server-side by the "students" permission. */}
                <Route
                  path="reports/call-list/:kind"
                  element={
                    <PlanFeatureGate feature="reportsExport">
                      <CallListView />
                    </PlanFeatureGate>
                  }
                />
                <Route path="website" element={<Website />} />
                <Route path="website/:sectionId" element={<WebsiteSectionEditor />} />
                <Route path="admissions" element={<AdmissionsReview />} />
                {/* docs/ATTENDANCE_DEVICE_SELFSERVICE_PLAN.md, Phase 1B —
                    reuses the "attendance" permission (same as /attendance
                    above), no PlanFeatureGate: device management is part of
                    the attendance feature itself, not a separate paid tier. */}
                <Route path="attendance-devices" element={<AttendanceDevices />} />
                <Route path="cameras" element={<Cameras />} />
                {/* docs/ATTENDANCE_DEVICE_SELFSERVICE_PLAN.md, Phase 4A —
                    in-app setup guide, same "attendance" permission as the
                    device-management page above (nested under it, not a
                    separate nav/permission bucket). */}
                <Route path="attendance-devices/guide" element={<AttendanceDeviceGuide />} />
                {/* docs/STAFF_ATTENDANCE_PLAN.md, Phase 5/6 */}
                <Route path="staff" element={<Staff />} />
                <Route path="staff-attendance" element={<StaffAttendance />} />
                <Route path="settings" element={<Settings />} />
                {/* Institution self-service platform-subscription billing
                    (ad-hoc, docs/CURRENT_TASK.md) — no PlanFeatureGate: every
                    institution regardless of plan needs to be able to pay
                    ITS OWN bill, this isn't a plan feature to gate behind
                    itself. Path matches routes/institutionBilling.js's
                    billingCallbackUrl()'s assumed shape (`${base}/settings/billing`). */}
                <Route path="settings/billing" element={<InstitutionBilling />} />
                {/* Guardian Reminder Messenger admin module — reuses the
                    "settings" permission (see server/src/config/roles.js's
                    ROUTE_PERMISSION entry for /api/guardian-reminders). No
                    PlanFeatureGate yet: plan-gating for this feature is
                    still an open decision (docs/CURRENT_TASK.md). */}
                <Route path="guardian-reminders" element={<GuardianReminders />} />
                <Route
                  path="sms"
                  element={
                    <PlanFeatureGate feature="sms">
                      <SmsSettings />
                    </PlanFeatureGate>
                  }
                />
                {/* Own-phone/SIM bulk SMS gateway (docs/OWN_SIM_BULK_SMS_GATEWAY_PLAN.md,
                    Phase 6) — reuses the same "sms" plan feature as the paid-reseller
                    SmsSettings route above (both are SMS-related, plan doc's Phase 2
                    note: no new feature key). Completely separate route/module though —
                    no wallet/balance involved here, just the institution's own phone. */}
                <Route
                  path="bulk-sms"
                  element={
                    <PlanFeatureGate feature="sms">
                      <BulkSms />
                    </PlanFeatureGate>
                  }
                />
                <Route
                  path="payment-gateway"
                  element={
                    <PlanFeatureGate feature="bkash">
                      <PaymentGatewaySettings />
                    </PlanFeatureGate>
                  }
                />
                <Route
                  path="audit-logs"
                  element={
                    <PlanFeatureGate feature="auditLogs">
                      <AuditLogs />
                    </PlanFeatureGate>
                  }
                />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}
