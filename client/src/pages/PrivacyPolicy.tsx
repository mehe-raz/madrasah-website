import { usePublicSite } from "../hooks/usePublicSite";
import { useSeoMeta } from "../hooks/useSeoMeta";
import { PublicHeader } from "../components/PublicHeader";
import { PublicFooter } from "../components/PublicFooter";
import { PublicPageSkeleton } from "../components/PublicPageSkeleton";

// Draft, placeholder legal copy — see docs/BUSINESS_READINESS_ROADMAP.md
// Phase 4. Mirrors TermsOfService.tsx's structure/notice — see that file's
// header comment for why the wording is a starting point, not final text.
function buildSections(siteName: string) {
  return [
    {
      title: "আমরা কী তথ্য সংগ্রহ করি",
      body: [
        `${siteName} ব্যবহারের সময় নিম্নলিখিত ধরনের তথ্য সংগ্রহ ও সংরক্ষণ করা হতে পারে: শিক্ষার্থীর নাম, জন্মনিবন্ধন/জন্মতারিখ, ঠিকানা, ছবি; অভিভাবকের নাম, ফোন নম্বর, ইমেইল; স্টাফ/অ্যাডমিনের লগইন তথ্য; হাজিরা, ফলাফল, হিফজ অগ্রগতি ও পেমেন্ট রেকর্ড।`,
        "এই তথ্য প্রতিষ্ঠান কর্তৃপক্ষ নিজেরাই সিস্টেমে প্রবেশ করান (ভর্তি ফর্ম, দৈনিক এন্ট্রি ইত্যাদির মাধ্যমে) — আমরা কোনো তৃতীয়-পক্ষ উৎস থেকে আলাদাভাবে তথ্য সংগ্রহ করি না।",
      ],
    },
    {
      title: "তথ্য কীভাবে ব্যবহার করা হয়",
      body: [
        "সংগৃহীত তথ্য শুধুমাত্র প্রতিষ্ঠানের একাডেমিক ও প্রশাসনিক কার্যক্রম পরিচালনার জন্য ব্যবহৃত হয় — যেমন হাজিরা রেকর্ড রাখা, ফলাফল প্রকাশ, ফি/পেমেন্ট হিসাব, এবং অভিভাবকদের কাছে নোটিশ/আপডেট পৌঁছানো।",
        "কোনো তথ্য বিজ্ঞাপন বা মার্কেটিং উদ্দেশ্যে বিক্রি বা ভাড়া দেওয়া হয় না।",
      ],
    },
    {
      title: "তথ্য সংরক্ষণ ও নিরাপত্তা",
      body: [
        "প্রতিটি প্রতিষ্ঠানের তথ্য প্রযুক্তিগতভাবে আলাদা রাখা হয় (মাল্টি-টেন্যান্ট আইসোলেশন) — একটি প্রতিষ্ঠানের ডাটা অন্য প্রতিষ্ঠান থেকে দেখা যায় না।",
        "পাসওয়ার্ড এনক্রিপ্ট করে সংরক্ষণ করা হয়, ভূমিকাভিত্তিক অ্যাক্সেস নিয়ন্ত্রণ (RBAC) প্রয়োগ করা হয়, এবং সংবেদনশীল কার্যক্রমের অডিট লগ রাখা হয়।",
        "নিয়মিত ব্যাকআপ নেওয়া হয়, তবে কোনো সিস্টেমই ১০০% ঝুঁকিমুক্ত নয় — আমরা যুক্তিসঙ্গত নিরাপত্তা ব্যবস্থা বজায় রাখার চেষ্টা করি।",
      ],
    },
    {
      title: "তথ্য শেয়ারিং",
      body: [
        "সেবা পরিচালনার জন্য প্রয়োজনীয় কিছু তৃতীয়-পক্ষ প্রোভাইডার (যেমন ইমেইল পাঠানোর সেবা, ছবি/ফাইল হোস্টিং, ডাটাবেজ হোস্টিং) ব্যবহার করা হতে পারে — শুধুমাত্র সেবা প্রদানের প্রয়োজনে, তাদের নিজস্ব নিরাপত্তা নীতির অধীনে।",
        "আইনি বাধ্যবাধকতা ছাড়া অভিভাবক বা শিক্ষার্থীর তথ্য কোনো বহিরাগত পক্ষের কাছে প্রকাশ করা হয় না।",
      ],
    },
    {
      title: "অভিভাবক ও শিক্ষার্থীর অধিকার",
      body: [
        "একজন অভিভাবক তার নিজের সন্তানের তথ্য (হাজিরা, ফলাফল, নোটিশ) অভিভাবক পোর্টালে লগইন করে দেখতে পারেন।",
        "কোনো তথ্য সংশোধন বা মুছে ফেলার প্রয়োজন হলে সরাসরি প্রতিষ্ঠান কর্তৃপক্ষের সাথে যোগাযোগ করুন — যেহেতু তথ্য প্রতিষ্ঠান কর্তৃক পরিচালিত হয়, সংশোধনও তাদের মাধ্যমেই করতে হয়।",
      ],
    },
    {
      title: "কুকিজ ও লোকাল স্টোরেজ",
      body: [
        "লগইন সেশন বজায় রাখতে এবং অফলাইন ব্যবহারের সুবিধার্থে ব্রাউজারের কুকি/লোকাল স্টোরেজ ব্যবহার করা হয় — বিজ্ঞাপন-ট্র্যাকিং কুকি ব্যবহার করা হয় না।",
      ],
    },
    {
      title: "নীতির পরিবর্তন",
      body: [
        "এই গোপনীয়তা নীতি সময়ে সময়ে হালনাগাদ করা হতে পারে। উল্লেখযোগ্য পরিবর্তন হলে এই পাতায় নতুন তারিখসহ প্রকাশ করা হবে।",
      ],
    },
    {
      title: "যোগাযোগ",
      body: [
        "গোপনীয়তা নীতি সম্পর্কে কোনো প্রশ্ন বা উদ্বেগ থাকলে প্রতিষ্ঠানের সাথে সরাসরি যোগাযোগ করুন (নিচে ফুটারে দেওয়া যোগাযোগ তথ্য দেখুন)।",
      ],
    },
  ];
}

export function PrivacyPolicy() {
  const { site, content, loading } = usePublicSite();

  useSeoMeta({
    title: `গোপনীয়তা নীতি — ${site.name}`,
    description: `${site.name}-এ শিক্ষার্থী ও অভিভাবকের তথ্য কীভাবে সংগ্রহ, সংরক্ষণ ও ব্যবহার করা হয়।`,
  });

  if (loading) return <PublicPageSkeleton />;

  const sections = buildSections(site.name);

  return (
    <div className="app-shell page-shell">
      <div className="pattern-bg" aria-hidden />
      <PublicHeader site={site} classes={content.classes} />

      <section className="section-shell hero-shell section-pop">
        <div className="soft-panel-strong legal-content">
          <span className="pill legal-page__badge">আইনি তথ্য</span>
          <h1 className="section-heading legal-page__heading">গোপনীয়তা নীতি</h1>
          <p className="legal-page__updated">সর্বশেষ হালনাগাদঃ আগস্ট ২০২৬</p>
          <p className="alert alert--amber legal-page__notice">
            এটি একটি খসড়া নথি — বাস্তব গ্রাহকদের কাছে ব্যবহারের আগে একজন আইনজীবীর মাধ্যমে পর্যালোচনা করিয়ে
            নেওয়া প্রয়োজন। এখানে থাকা বিষয়বস্তু একটি প্রাথমিক কাঠামো মাত্র, চূড়ান্ত আইনি ভাষা নয়।
          </p>
        </div>
      </section>

      <section className="section-shell page-section section-pop">
        {sections.map((s) => (
          <div key={s.title} className="soft-panel legal-content">
            <h2 className="legal-content__title">{s.title}</h2>
            <div className="legal-content__body">
              {s.body.map((paragraph, i) => (
                <p key={i}>{paragraph}</p>
              ))}
            </div>
          </div>
        ))}
      </section>

      <PublicFooter site={site} />
    </div>
  );
}
