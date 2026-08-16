/**
 * Shared fetch layer for the generated-style React Query hooks.
 *
 * All calls are same-origin relative to `/api`, and always send cookies —
 * the admin session and the Clerk session both ride on cookies.
 */

export const API_BASE = "/api";

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `Request failed with status ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export type QueryParams = Record<
  string,
  string | number | boolean | null | undefined
>;

/** Drops null/undefined/"" so we never send `?artType=` and match nothing. */
export function toSearchParams(params?: QueryParams): string {
  if (!params) return "";
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.append(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function apiRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  const body = await parseBody(response);

  if (!response.ok) {
    const message =
      body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : undefined;
    throw new ApiError(response.status, body, message);
  }

  return body as T;
}

export const apiGet = <T>(path: string): Promise<T> => apiRequest<T>(path);

export const apiPost = <T>(path: string, data?: unknown): Promise<T> =>
  apiRequest<T>(path, {
    method: "POST",
    body: data === undefined ? undefined : JSON.stringify(data),
  });

export const apiDelete = <T>(path: string): Promise<T> =>
  apiRequest<T>(path, { method: "DELETE" });
