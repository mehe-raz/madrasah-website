// server/src/middleware/csrf.js
//
// Defense-in-depth CSRF protection (double-submit cookie pattern), on top of
// the existing protections this app already has (JSON-only body parsing
// forces a CORS preflight on any cross-origin write, and the CORS origin
// allow-list blocks that preflight for unknown origins). Those two already
// stop a plain cross-site <form>/fetch from succeeding, but they rely on the
// browser correctly enforcing CORS — this adds a second, independent check
// that doesn't depend on CORS at all, which matters because the auth cookie
// is set with `sameSite: "none"` in production (required so the API on one
// subdomain can be called from the client on another), so the cookie itself
// is sent cross-site by the browser regardless of CORS.
//
// How it works: issueCsrfToken sets a random token in a *readable* (non
// httpOnly) cookie so client-side JS can read it and echo it back as a
// request header. verifyCsrfToken then just checks the header matches the
// cookie. A cross-site attacker can make the browser *send* the cookie, but
// per same-origin policy can't *read* it to put its value in the header —
// so the two won't match.

const crypto = require("crypto");

const COOKIE_NAME = "csrfToken";
const HEADER_NAME = "x-csrf-token";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function cookieOptions() {
  return {
    httpOnly: false, // must be readable by client JS — that's the whole mechanism
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 24 * 60 * 60 * 1000,
    path: "/",
  };
}

// Ensures every request has a CSRF cookie to echo back. Mounted early
// (before routes) so it's set even on GET requests, ready for the next
// mutating call.
function issueCsrfToken(req, res, next) {
  if (!req.cookies?.[COOKIE_NAME]) {
    const token = crypto.randomBytes(32).toString("hex");
    res.cookie(COOKIE_NAME, token, cookieOptions());
    req.cookies = { ...req.cookies, [COOKIE_NAME]: token };
  }
  next();
}

// Only enforced for authenticated, state-changing requests — mounted after
// requireAuth. Public endpoints (admissions form, result lookup) have no
// session cookie to protect, so there's nothing for CSRF to defend there;
// they rely on their own rate limiting instead (see index.js).
function verifyCsrfToken(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  const cookieToken = req.cookies?.[COOKIE_NAME];
  const headerToken = req.get(HEADER_NAME);
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({ error: "CSRF token missing or invalid" });
  }
  next();
}

module.exports = { issueCsrfToken, verifyCsrfToken, COOKIE_NAME, HEADER_NAME };
