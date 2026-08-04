// server/src/lib/guardianAuthSchemas.js
//
// Zod schemas for routes/guardianAuth.js. Same split as authSchemas.js:
// these only guarantee shape/type, business rules (password strength,
// 4-field student match) still live in the route handler.

const { z } = require("zod");

const signupSchema = z
  .object({
    guardianName: z.string().trim().min(1, "আপনার নাম আবশ্যক"),
    contactMobile: z.string().trim().optional().default(""),
    contactEmail: z.string().trim().optional().default(""),
    password: z.string().min(1, "পাসওয়ার্ড আবশ্যক"),
    // roll + class are the only fields needed to locate a candidate row at
    // all (see the query in routes/guardianAuth.js), so those two stay
    // required. studentName and guardianMobile are the *scoring* fields —
    // the 0-1/2/3-4 match-count table only works if a guardian who simply
    // doesn't remember/know one of them can still submit: leaving it blank
    // just means it won't count as a match, correctly landing the signup
    // in "pending" (Admin review) instead of blocking the form entirely.
    studentName: z.string().trim().optional().default(""),
    studentRoll: z.string().trim().min(1, "রোল নাম্বার আবশ্যক"),
    studentClass: z.string().trim().min(1, "ক্লাস আবশ্যক"),
    guardianMobile: z.string().trim().optional().default(""),
  })
  // At least one of mobile/email is required so the account can actually be
  // logged into afterwards — mirrors the partial-unique-index pair on
  // guardian_accounts (mobile, email) in the schema.
  .refine((data) => Boolean(data.contactMobile) || Boolean(data.contactEmail), {
    message: "যোগাযোগের জন্য মোবাইল অথবা ইমেইল অন্তত একটি দিন",
    path: ["contactMobile"],
  })
  .refine((data) => !data.contactEmail || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.contactEmail), {
    message: "সঠিক ইমেইল ঠিকানা দিন",
    path: ["contactEmail"],
  });

const loginSchema = z.object({
  // Guardian logs in with whichever of mobile/email they signed up with —
  // one free-text field, resolved against both columns in the route.
  identifier: z.string().trim().min(1, "মোবাইল অথবা ইমেইল দিন"),
  password: z.string().min(1, "পাসওয়ার্ড আবশ্যক"),
});

const addChildSchema = z.object({
  studentName: z.string().trim().optional().default(""),
  studentRoll: z.string().trim().min(1, "রোল নাম্বার আবশ্যক"),
  studentClass: z.string().trim().min(1, "ক্লাস আবশ্যক"),
  guardianMobile: z.string().trim().optional().default(""),
});

module.exports = { signupSchema, loginSchema, addChildSchema };
