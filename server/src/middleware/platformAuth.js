// ============================================================================
// platformAuth.js  (Part 5 / 6 — Super-Admin panel)
// ============================================================================
// Authentication for the platform/Super-Admin panel — deliberately a SEPARATE
// module from middleware/auth.js (which is a protected path per AGENTS.md
// and handles per-institution user logins). Keeping these apart means:
//   - a platform admin's token can never be mistaken for a tenant user's
//     token (different cookie name, different JWT payload shape, and by
//     default a different signing secret)
//   - editing platform-admin auth never requires touching the protected
//     tenant-auth file
//
// Uses its own cookie ("platform_token") so a browser can be logged into
// both a madrasah's own dashboard AND the platform panel at the same time
// without the two colliding.
// ============================================================================

const jwt = require("jsonwebtoken");

// Falls back to a value DERIVED from JWT_SECRET (not the same string) so a
// fresh checkout with only JWT_SECRET set still works — but the derivation
// means a platform token can never accidentally verify successfully against
// the plain JWT_SECRET used for tenant tokens, or vice versa. Setting a
// genuinely separate PLATFORM_JWT_SECRET in production is still recommended
// (see .env.example) so compromising one secret doesn't affect the other.
const PLATFORM_JWT_SECRET =
  process.env.PLATFORM_JWT_SECRET ||
  `platform:${process.env.JWT_SECRET || "madrasah-erp-change-in-production-min-32-chars!!"}`;

function validatePlatformAuthConfig() {
  if (process.env.NODE_ENV === "production") {
    if (!process.env.PLATFORM_JWT_SECRET || process.env.PLATFORM_JWT_SECRET.length < 32) {
      throw new Error(
        "PLATFORM_JWT_SECRET must be set to a strong 32+ character value in production (separate from JWT_SECRET)"
      );
    }
  }
}

const cookieOptions = {
  httpOnly: true,
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  secure: process.env.NODE_ENV === "production",
  maxAge: 12 * 60 * 60 * 1000, // 12h — shorter-lived than tenant user sessions (7d), since this
  // account can touch every institution; force more frequent re-login.
  path: "/",
};

function signPlatformToken(admin) {
  return jwt.sign(
    { id: admin.id, email: admin.email, name: admin.name, role: admin.role, type: "platform" },
    PLATFORM_JWT_SECRET,
    { expiresIn: "12h" }
  );
}

function requirePlatformAuth(req, res, next) {
  const token = req.cookies?.platform_token;
  if (!token) return res.status(401).json({ error: "Login required" });
  try {
    const payload = jwt.verify(token, PLATFORM_JWT_SECRET);
    if (payload.type !== "platform") throw new Error("wrong token type");
    req.platformAdmin = payload;
    next();
  } catch {
    return res.status(401).json({ error: "Session expired" });
  }
}

// Restricts a route to specific platform-admin roles (super_admin/admin/
// manager — see registry.platform_admins). Always used AFTER
// requirePlatformAuth, so req.platformAdmin is already set. Tokens signed
// before this role system existed have no `role` claim; they're treated as
// 'super_admin' so an already-logged-in operator isn't suddenly locked out
// mid-session — they'll get the real role from the DB on their next login.
function requirePlatformRole(...allowedRoles) {
  return (req, res, next) => {
    const role = req.platformAdmin?.role || "super_admin";
    if (!allowedRoles.includes(role)) {
      return res.status(403).json({ error: "এই কাজের জন্য অনুমতি নেই" });
    }
    next();
  };
}

module.exports = {
  signPlatformToken,
  requirePlatformAuth,
  requirePlatformRole,
  validatePlatformAuthConfig,
  cookieOptions,
};
