/**
 * Page-level SEO tags | পেজভিত্তিক SEO ট্যাগ
 *
 * The server already injects the correct <title>/description/OG tags into
 * the very first HTML response for known public routes (see
 * server/src/lib/seoMeta.js) — that's what matters for crawlers and
 * WhatsApp/Facebook link previews, since those never run our JS.
 *
 * This hook exists for everything that happens *after* that first paint:
 * the browser tab title and in-page meta tags while the user navigates
 * around the SPA client-side (React Router never reloads the document, so
 * without this the tab would keep showing whichever route loaded first).
 * It mirrors the server's per-route values so the two stay in sync.
 */
import { useEffect } from "react";

export interface SeoMetaInput {
  title: string;
  description?: string;
  image?: string;
  /** Defaults to true. Set false only for pages that should never be indexed (login, previews, etc). */
  index?: boolean;
}

function upsertMeta(selector: string, create: () => HTMLMetaElement, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = create();
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

export function useSeoMeta({ title, description, image, index = true }: SeoMetaInput) {
  useEffect(() => {
    document.title = title;

    if (description) {
      upsertMeta(
        'meta[name="description"]',
        () => {
          const el = document.createElement("meta");
          el.setAttribute("name", "description");
          return el;
        },
        description
      );
      upsertMeta(
        'meta[property="og:description"]',
        () => {
          const el = document.createElement("meta");
          el.setAttribute("property", "og:description");
          return el;
        },
        description
      );
      upsertMeta(
        'meta[name="twitter:description"]',
        () => {
          const el = document.createElement("meta");
          el.setAttribute("name", "twitter:description");
          return el;
        },
        description
      );
    }

    upsertMeta(
      'meta[property="og:title"]',
      () => {
        const el = document.createElement("meta");
        el.setAttribute("property", "og:title");
        return el;
      },
      title
    );
    upsertMeta(
      'meta[name="twitter:title"]',
      () => {
        const el = document.createElement("meta");
        el.setAttribute("name", "twitter:title");
        return el;
      },
      title
    );

    if (image) {
      upsertMeta(
        'meta[property="og:image"]',
        () => {
          const el = document.createElement("meta");
          el.setAttribute("property", "og:image");
          return el;
        },
        image
      );
      upsertMeta(
        'meta[name="twitter:image"]',
        () => {
          const el = document.createElement("meta");
          el.setAttribute("name", "twitter:image");
          return el;
        },
        image
      );
    }

    const url = window.location.href;
    upsertMeta(
      'meta[property="og:url"]',
      () => {
        const el = document.createElement("meta");
        el.setAttribute("property", "og:url");
        return el;
      },
      url
    );

    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.setAttribute("href", url);

    let robots = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (!robots) {
      robots = document.createElement("meta");
      robots.setAttribute("name", "robots");
      document.head.appendChild(robots);
    }
    robots.setAttribute("content", index ? "index, follow" : "noindex, nofollow");
  }, [title, description, image, index]);
}
