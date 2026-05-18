const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "madrasah-erp-change-in-production-min-32-chars!!";

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  const cookie = req.cookies?.token;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : cookie;
  if (!token) return res.status(401).json({ error: "Login required" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Session expired" });
  }
}

module.exports = { signToken, requireAuth, JWT_SECRET };
