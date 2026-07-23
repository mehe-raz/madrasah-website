// Requires 8+ chars plus at least 3 of the 4 character classes (upper,
// lower, digit, symbol) — stronger than a bare length check without being
// as user-hostile as demanding all four every time.
// Returns an error string, or null if the password is acceptable.
function passwordPolicyError(password) {
  if (!password || password.length < 8) {
    return "Password must be at least 8 characters";
  }
  if (password.length > 128) {
    return "Password is too long";
  }
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
  if (classes < 3) {
    return "Password must include at least 3 of: lowercase, uppercase, numbers, symbols";
  }
  return null;
}

module.exports = { passwordPolicyError };
