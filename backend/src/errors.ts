import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";

// All errors leave the API as { error: { code, message } }. Internal details are logged, never returned.
export class ApiError extends HTTPException {
  // `fields`: which form fields were wrong, so the page can show the message next to them.
  constructor(status: ContentfulStatusCode, readonly code: string, message: string, readonly fields?: Record<string, string>) {
    super(status, { message });
  }
}

export const notFound = (what = "Resource") => new ApiError(404, "not_found", `${what} not found.`);
export const unauthorized = () => new ApiError(401, "unauthorized", "Please log in to continue.");
export const forbidden = () => new ApiError(403, "forbidden", "You can't do that.");

// Supabase/Postgres errors are logged with context and turned into a generic 500.
export function dbFail(context: string, error: unknown): never {
  console.error(`[db] ${context}`, error);
  throw new ApiError(500, "server_error", "Something went wrong on our side. Please try again.");
}
