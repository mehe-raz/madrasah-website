// পাবলিক পেজগুলো (Home/About/Admission/...) প্রথমবার লোড হওয়ার সময় আসল
// প্রতিষ্ঠানের নাম-লোগো-ডাটা API থেকে আসার আগ পর্যন্ত এই হালকা স্কেলিটন
// দেখানো হয় — যাতে ডিফল্ট/ডেমো নাম, লোগো বা টেক্সট এক মুহূর্তের জন্যও
// স্ক্রিনে না আসে। আসল ডাটা লোড হওয়ার সাথে সাথে এটি রিয়েল কনটেন্ট দিয়ে
// প্রতিস্থাপিত হয়ে যায়। এটি ইচ্ছাকৃতভাবে .page-shell/.app-shell ক্লাস
// ব্যবহার করে না, যাতে সাইট-ওয়াইড বর্গাকার-কোণা নিয়ম এই স্পিনারকে প্রভাবিত
// না করে। ডিজাইন: YouTube-এর লোডিং স্পিনারের মতো — প্রায়-কালো ব্যাকগ্রাউন্ড,
// সাদা রঙের স্পিনার, স্ক্রিনের একদম মাঝখানে না রেখে একটু উপরের দিকে (যেখানে
// ভিডিও প্লেয়ার/কনটেন্ট এরিয়া শুরু হয়) বসানো হয়েছে।
export function PublicPageSkeleton() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", justifyContent: "center", paddingTop: "22vh", background: "#0f0f0f" }}>
      <div
        aria-hidden
        style={{
          width: 34,
          height: 34,
          border: "3px solid rgba(255, 255, 255, 0.25)",
          borderTopColor: "#ffffff",
          borderRadius: "50%",
          animation: "spin 800ms linear infinite",
        }}
      />
    </div>
  );
}
