import { usePublicSite } from "../hooks/usePublicSite";
import { useSeoMeta } from "../hooks/useSeoMeta";
import { PublicHeader } from "../components/PublicHeader";
import { PublicFooter } from "../components/PublicFooter";
import { PublicPageSkeleton } from "../components/PublicPageSkeleton";

// Draft, placeholder legal copy — see docs/BUSINESS_READINESS_ROADMAP.md
// Phase 4. This gives the app a real /terms route and a real link target
// from the footer and the self-signup flow; the wording itself still needs
// a lawyer's review before it's relied on with real customers (the amber
// notice below says so on the page itself).
function buildSections(siteName: string) {
  return [
    {
      title: "সেবার বিবরণ",
      body: [
        `${siteName} একটি মাদ্রাসা/শিক্ষা প্রতিষ্ঠান ব্যবস্থাপনা সফটওয়্যার (ERP) — শিক্ষার্থী ভর্তি, হাজিরা, হিফজ অগ্রগতি, পরীক্ষার ফলাফল, আয়-ব্যয় ও পেমেন্ট, এবং নোটিশ/অ্যাসাইনমেন্ট প্রচারের সুবিধা প্রদান করে।`,
        "এই সেবা ব্যবহার করার মাধ্যমে আপনি নিচের শর্তাবলী মেনে নিচ্ছেন বলে গণ্য হবে। আপনি যদি এই শর্তাবলীর সাথে একমত না হন, তাহলে সেবাটি ব্যবহার করা থেকে বিরত থাকুন।",
      ],
    },
    {
      title: "অ্যাকাউন্ট ও ব্যবহারকারীর দায়িত্ব",
      body: [
        "প্রতিষ্ঠান/অ্যাডমিন হিসেবে অ্যাকাউন্ট খোলার সময় প্রদত্ত তথ্য সঠিক ও হালনাগাদ রাখার দায়িত্ব আপনার।",
        "আপনার লগইন তথ্য (ইমেইল/পাসওয়ার্ড) গোপন রাখা এবং আপনার অ্যাকাউন্টের মাধ্যমে সংঘটিত সকল কার্যক্রমের জন্য আপনি দায়ী থাকবেন।",
        "সিস্টেমে প্রবেশাধিকারপ্রাপ্ত প্রতিটি স্টাফের কার্যক্রম প্রতিষ্ঠানের নিজস্ব দায়িত্বের অধীনে থাকবে।",
      ],
    },
    {
      title: "শিক্ষার্থী ও অভিভাবকের তথ্য",
      body: [
        "প্রতিষ্ঠান কর্তৃক শিক্ষার্থী ও অভিভাবকের যেসব তথ্য (নাম, জন্মনিবন্ধন, ঠিকানা, যোগাযোগ নম্বর ইত্যাদি) সিস্টেমে যুক্ত করা হয়, তার সঠিকতা ও সংগ্রহের বৈধতা নিশ্চিত করার দায়িত্ব প্রতিষ্ঠানের।",
        "এই তথ্য কীভাবে সংরক্ষণ ও ব্যবহার করা হয় তা নিয়ে বিস্তারিত জানতে আমাদের গোপনীয়তা নীতি দেখুন।",
      ],
    },
    {
      title: "পেমেন্ট ও সাবস্ক্রিপশন",
      body: [
        "কিছু ফিচার নির্দিষ্ট প্ল্যানের (বেসিক/প্রো) অধীনে সীমাবদ্ধ থাকতে পারে। প্ল্যান পরিবর্তন বা মেয়াদ শেষ হলে সংশ্লিষ্ট ফিচারের প্রবেশাধিকার প্রভাবিত হতে পারে।",
        "ফ্রি ট্রায়াল শেষে সেবা চালু রাখতে চাইলে নির্ধারিত পদ্ধতিতে সাবস্ক্রিপশন সক্রিয় করতে হবে (চূড়ান্ত মূল্য ও পেমেন্ট পদ্ধতি ভবিষ্যতে যুক্ত হবে)।",
      ],
    },
    {
      title: "সেবার সীমাবদ্ধতা ও দায়বদ্ধতা",
      body: [
        `${siteName} সফটওয়্যারটি "যেমন আছে" ভিত্তিতে সরবরাহ করা হয় — অবিচ্ছিন্ন, ত্রুটিমুক্ত সেবার নিশ্চয়তা দেওয়া হয় না, যদিও নির্ভরযোগ্যতা বজায় রাখতে চেষ্টা করা হয়।`,
        "কারিগরি ত্রুটি, ইন্টারনেট সংযোগ বিঘ্ন, বা তৃতীয়-পক্ষ সেবার (যেমন ইমেইল/স্টোরেজ প্রোভাইডার) সাময়িক অনুপলব্ধতার কারণে সৃষ্ট ক্ষতির জন্য দায়বদ্ধতা সীমিত থাকবে।",
      ],
    },
    {
      title: "শর্তাবলীর পরিবর্তন",
      body: [
        "এই শর্তাবলী সময়ে সময়ে হালনাগাদ করা হতে পারে। উল্লেখযোগ্য পরিবর্তন হলে এই পাতায় নতুন তারিখসহ প্রকাশ করা হবে।",
      ],
    },
    {
      title: "যোগাযোগ",
      body: [
        "এই শর্তাবলী সম্পর্কে কোনো প্রশ্ন থাকলে প্রতিষ্ঠানের সাথে সরাসরি যোগাযোগ করুন (নিচে ফুটারে দেওয়া যোগাযোগ তথ্য দেখুন)।",
      ],
    },
  ];
}

export function TermsOfService() {
  const { site, content, loading } = usePublicSite();

  useSeoMeta({
    title: `শর্তাবলী — ${site.name}`,
    description: `${site.name} ব্যবহারের শর্তাবলী ও নিয়মকানুন।`,
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
          <h1 className="section-heading legal-page__heading">সেবা ব্যবহারের শর্তাবলী</h1>
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
