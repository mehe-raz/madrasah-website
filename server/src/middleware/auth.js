const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "madrasah-erp-change-in-production-min-32-chars!!";

function validateAuthConfig() {
  if (process.env.NODE_ENV === "production") {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
      throw new Error("JWT_SECRET must be set to a strong 32+ character value in production");
    }
  }
}

// institution is optional and only ever passed by callers running under
// MULTI_TENANT_MODE=true (see routes/auth.js). When omitted — every existing
// single-tenant deployment — the payload shape is byte-for-byte identical to
// before Part 4, so old tokens and new tokens are interchangeable there.
//
// When an institution IS passed, its `code` is baked into the token
// (institutionCode). This isn't just informational: verifyRequestToken()
// below checks it against the institution the *current request* resolved
// to. Without this binding, a JWT is only ever checked against JWT_SECRET,
// which is shared across every tenant — so a valid token obtained by
// legitimately logging into institution A's subdomain could otherwise be
// replayed against institution B's subdomain (same cookie/header, different
// Host), and B's routes would trust req.user.id as if it were one of B's
// own users, since tenant DB routing depends only on the request's
// hostname, not on anything in the token. Binding the token to the
// institution it was issued for closes that hole.
function signToken(user, institution) {
  const payload = { id: user.id, email: user.email, role: user.role, name: user.name };
  if (institution) {
    payload.institutionId = institution.id;
    payload.institutionCode = institution.code;
  }
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

// Shared by requireAuth below and the /api/auth/me route (which needs the
// same verification outside the normal requireAuth chain). Throws on any
// failure; callers translate that into a 401.
function verifyRequestToken(req) {
  const token = req.cookies?.token;
  if (!token) {
    const err = new Error("Login required");
    err.status = 401;
    throw err;
  }
  const payload = jwt.verify(token, JWT_SECRET);

  // Only enforced when this request actually resolved to a tenant (i.e.
  // MULTI_TENANT_MODE=true and tenantResolve ran — see middleware/
  // tenantResolve.js). In single-tenant deployments req.tenant is never
  // set, so this block is skipped and behavior is unchanged from before
  // Part 4.
  if (req.tenant) {
    if (payload.institutionCode !== req.tenant.code) {
      // Covers three cases with one check: (a) cross-tenant replay — token
      // was issued for a different institution's subdomain, (b) a token
      // issued before Part 4 / before MULTI_TENANT_MODE was turned on,
      // which has no institutionCode claim at all, (c) an institution whose
      // `code` changed after the token was issued. All three should simply
      // force a fresh login against the current subdomain, not be treated
      // as a special error a user needs to interpret.
      const err = new Error("Session expired");
      err.status = 401;
      throw err;
    }
  }

  return payload;
}

function requireAuth(req, res, next) {
  try {
    req.user = verifyRequestToken(req);
    next();
  } catch (err) {
    return res.status(err.status || 401).json({ error: err.status ? err.message : "Session expired" });
  }
}

module.exports = { signToken, requireAuth, verifyRequestToken, JWT_SECRET, validateAuthConfig };
