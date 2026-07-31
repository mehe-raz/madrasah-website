/**
 * Scroll-reveal on-enter animation | স্ক্রল করলে সেকশন দৃশ্যমান হওয়ার অ্যানিমেশন
 *
 * Unlike `.section-pop` (index.css), which only plays once at mount time,
 * this triggers per-element the moment it enters the viewport while the
 * user scrolls — the effect used for the image/text blocks on the public
 * marketing pages (Home, About, Departments, ...).
 *
 * Usage:
 *   const ref = useReveal<HTMLDivElement>();
 *   <div ref={ref} className="reveal reveal-image"> ... </div>
 *
 * Respects prefers-reduced-motion: if the user has that OS setting on,
 * the element is marked visible immediately with no animation.
 */
import { useEffect, useRef } from "react";

let sharedObserver: IntersectionObserver | null = null;

function getObserver() {
  if (sharedObserver) return sharedObserver;
  sharedObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("reveal-visible");
          sharedObserver?.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.15, rootMargin: "0px 0px -8% 0px" }
  );
  return sharedObserver;
}

export function useReveal<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      el.classList.add("reveal-visible");
      return;
    }

    const observer = getObserver();
    observer.observe(el);
    return () => observer.unobserve(el);
  }, []);

  return ref;
}
