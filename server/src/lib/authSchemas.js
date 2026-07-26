// server/src/lib/authSchemas.js
//
// Zod schemas for auth.js. These only guarantee shape/type (right field,
// right type, not empty) — business rules like password strength still
// live in passwordPolicyError(), which runs after this.

const { z } = require("zod");

const registerSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

const loginSchema = z.object({
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

const forgotPasswordSchema = z.object({
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email address"),
});

const resetPasswordSchema = z.object({
  // Reset "token" is now a 6-digit OTP code emailed to the user (see
  // routes/auth.js forgot-password/reset-password) instead of a long random
  // link token, so it's shaped/validated as exactly 6 digits.
  token: z
    .string()
    .trim()
    .min(1, "Reset code is required")
    .regex(/^\d{6}$/, "Reset code must be the 6-digit code emailed to you"),
  password: z.string().min(1, "Password is required"),
});

module.exports = { registerSchema, loginSchema, forgotPasswordSchema, resetPasswordSchema };
