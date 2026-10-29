import "server-only";
import type { ApiError, ApiErrorCode } from "@/types";

/** JSON error response in the shape described in the API reference. */
export function apiError(
  status: number,
  error: ApiErrorCode,
  extra: Omit<ApiError, "error"> = {},
  headers?: HeadersInit,
) {
  return Response.json({ error, ...extra } satisfies ApiError, {
    status,
    headers,
  });
}

/** Reads and parses a JSON body, returning null when it isn't valid JSON. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
