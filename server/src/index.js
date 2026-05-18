require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");

require("./db");

const { requireAuth } = require("./middleware/auth");
const { rbacMiddleware } = require("./middleware/rbac");

app.listen(process.env.PORT || 10000, () => {
  console.log("Server running...");
});
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(
  cors({
    origin: CLIENT_ORIGIN,
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json({ limit: "2mb" }));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 1000, message: { error: "Too many attempts" } });
const apiLimiter = rateLimit({ windowMs: 1 * 60 * 1000, max: 200 });

app.use("/api/auth", authLimiter, require("./routes/auth"));
app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.use("/api", apiLimiter, requireAuth, rbacMiddleware);

app.use("/api/students", require("./routes/students"));
app.use("/api/attendance", require("./routes/attendance"));
app.use("/api/payments", require("./routes/payments"));
app.use("/api/income", require("./routes/income"));
app.use("/api/expenses", require("./routes/expenses"));
app.use("/api/hifz", require("./routes/hifz"));
app.use("/api/settings", require("./routes/settings"));
app.use("/api/users", require("./routes/users"));
app.use("/api/dashboard", require("./routes/dashboard"));
app.use("/api/reports", require("./routes/reports"));
app.use("/api/backup", require("./routes/backup"));

app.listen(PORT, () => {
  console.log(`Madrasah ERP API running on http://localhost:${PORT}`);
});
