import { Router } from "express";
import { createClerkClient } from "@clerk/backend";
import { rateLimit } from "../lib/rateLimit";

const router = Router();

/**
 * This endpoint has to stay unauthenticated — it is what lets a guest complete
 * checkout without signing up first. That makes it an account factory, so it is
 * rate limited per IP and validates its input before touching Clerk.
 *
 * Five accounts per IP per hour is far more than a real customer needs and low
 * enough that scripted abuse stops being useful.
 */
const accountRateLimit = rateLimit({
  name: "collector-account",
  limit: 5,
  windowMs: 60 * 60_000,
  message: "Too many account attempts from this address. Please try again later.",
});

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MIN_PASSWORD_LENGTH = 8;

const getClerkClient = () =>
  createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });

// POST /api/collector/account
// Creates a new Clerk collector account server-side (no email verification required).
// If the email already exists, returns the existing userId so the order can still be linked.
router.post("/collector/account", accountRateLimit, async (req, res) => {
  const { email, password, name, phone } = req.body as {
    email?: unknown;
    password?: unknown;
    name?: unknown;
    phone?: unknown;
  };

  if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }
  if (!EMAIL_RE.test(email) || email.length > 200) {
    return res.status(400).json({ error: "Please enter a valid email address." });
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
  }

  const clerk = getClerkClient();

  // Split display name into first/last for Clerk
  const parts = (typeof name === "string" ? name : "").trim().split(/\s+/);
  const firstName = parts[0] || undefined;
  const lastName  = parts.slice(1).join(" ") || undefined;

  try {
    const user = await clerk.users.createUser({
      emailAddress: [email],
      password,
      firstName,
      lastName,
      unsafeMetadata: { phone: typeof phone === "string" ? phone.slice(0, 50) : "" },
      // `skipPasswordChecks: true` used to be set here, which let Clerk accept
      // passwords it knows to be weak or breached. These accounts can read a
      // collector's order history and contact details, so the checks stay on.
      // Clerk's rejection message is surfaced in the checkout form already.
    });
    return res.json({ clerkUserId: user.id, created: true });
  } catch (err: any) {
    // Check if the email is already taken — return the existing userId instead of erroring
    const errors: any[] = err?.errors ?? [];
    const isEmailTaken = errors.some(
      (e) =>
        e.code === "form_identifier_exists" ||
        e.code === "form_identifier_already_exists" ||
        e.code === "email_address_taken"
    );

    if (isEmailTaken || err?.status === 422) {
      try {
        const list = await clerk.users.getUserList({ emailAddress: [email] });
        const existing = list.data[0];
        if (existing) {
          return res.json({ clerkUserId: existing.id, created: false });
        }
      } catch {
        // fall through
      }
    }

    const msg =
      errors[0]?.longMessage ??
      errors[0]?.message ??
      "Could not create collector account. Please try again.";
    return res.status(400).json({ error: msg });
  }
});

export default router;
