import type { ZodError } from "zod/v4";

/**
 * Turn a Zod failure into one readable sentence.
 *
 * `error.message` is a JSON dump of the issue tree — fine in a log, useless in
 * a toast. This produces "items.0: Each item must reference exactly one of
 * artworkId or shopItemId".
 */
export function formatZodError(error: ZodError): string {
  const issues = error.issues.slice(0, 3).map((issue) => {
    const path = issue.path.join(".");
    return path ? `${path}: ${issue.message}` : issue.message;
  });
  const extra = error.issues.length > 3 ? ` (+${error.issues.length - 3} more)` : "";
  return issues.join("; ") + extra;
}
