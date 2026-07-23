// server/src/middleware/validate.js
//
// Generic request-body validator. Pass a Zod schema; on success req.body
// is replaced with the parsed/trimmed data, on failure a clean 400 is
// returned instead of the handler crashing on a wrong-typed field.
//
// Usage: router.post("/login", validate(loginSchema), async (req, res) => {...})

function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".") || "_";
        if (!errors[key]) errors[key] = issue.message;
      }
      return res.status(400).json({ error: "Validation failed", errors });
    }
    req.body = result.data;
    next();
  };
}

module.exports = { validate };
