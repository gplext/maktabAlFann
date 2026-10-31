/**
 * Pure risk-scoring function for artist registrations and claim requests.
 * All async lookups (Clerk, DB) are done by the caller; this function is
 * deterministic and unit-testable with no side effects.
 */

const KNOWN_ARTISTS = [
  "sadequain",
  "gulgee",
  "iqbal mehdi",
  "abdur rahman chughtai",
  "jamil naqsh",
  "ismail gulgee",
  "shakir ali",
  "zubeida agha",
  "bashir mirza",
  "ahmed parvez",
];

const DISPOSABLE_DOMAINS = [
  "mailinator.com", "guerrillamail.com", "tempmail.com", "throwaway.email",
  "yopmail.com", "trashmail.com", "fakeinbox.com", "sharklasers.com",
  "guerrillamailblock.com", "spam4.me", "maildrop.cc", "dispostable.com",
  "mailnull.com", "spamgourmet.com", "10minutemail.com", "getairmail.com",
  "filzmail.com", "discard.email",
];

export type RiskInput = {
  /** Hours since the Clerk account was created */
  clerkAccountAgeHours: number;
  /** Whether the primary email address is verified in Clerk */
  emailVerified: boolean;
  /** Domain part of the primary email (e.g. "gmail.com") */
  emailDomain: string;
  /** Name the artist submitted */
  name: string;
  /** Lowercase names of all existing artists in the DB (for similarity check) */
  existingArtistNames: string[];
  /** Uploaded profile photo URL — empty string means no photo */
  photoUrl: string;
  /** Biography text supplied during registration */
  biography: string;
};

export type RiskResult = {
  score: number;
  flags: string[];
};

/** Iterative Levenshtein distance — O(m·n) time, O(n) space */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const curr = [i];
    for (let j = 1; j <= n; j++) {
      curr[j] =
        a[i - 1] === b[j - 1]
          ? prev[j - 1]
          : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    prev = curr;
  }
  return prev[n];
}

export function computeRiskScore(input: RiskInput): RiskResult {
  let score = 0;
  const flags: string[] = [];

  // ── Account age ────────────────────────────────────────────────────────────
  if (input.clerkAccountAgeHours < 24) {
    score += 20;
    flags.push("new_account");
  }

  // ── Email verification ─────────────────────────────────────────────────────
  if (!input.emailVerified) {
    score += 25;
    flags.push("unverified_email");
  }

  // ── Disposable email domain ────────────────────────────────────────────────
  if (DISPOSABLE_DOMAINS.includes(input.emailDomain.toLowerCase())) {
    score += 10;
    flags.push("disposable_email");
  }

  // ── Well-known Pakistani artist name ──────────────────────────────────────
  const nameLower = input.name.toLowerCase().trim();
  if (KNOWN_ARTISTS.some((k) => nameLower === k || nameLower.includes(k))) {
    score += 40;
    flags.push("known_artist_name");
  }

  // ── Name closely matches an existing artist (Levenshtein 1–3) ─────────────
  const hasSimilar = input.existingArtistNames.some((existing) => {
    if (existing === nameLower) return false; // exact match is fine — handled separately
    const dist = levenshtein(nameLower, existing);
    return dist >= 1 && dist <= 3;
  });
  if (hasSimilar) {
    score += 30;
    flags.push("name_similar_to_existing");
  }

  // ── No profile photo ───────────────────────────────────────────────────────
  if (!input.photoUrl || input.photoUrl.trim() === "") {
    score += 10;
    flags.push("no_photo");
  }

  // ── Biography under 50 characters ─────────────────────────────────────────
  if ((input.biography ?? "").trim().length < 50) {
    score += 10;
    flags.push("short_bio");
  }

  return { score, flags };
}
