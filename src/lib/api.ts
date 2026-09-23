import { ValidationError } from "./pipeline/personas";

/** Uniform JSON error responses for route handlers. */
export function jsonError(err: unknown): Response {
  if (err instanceof ValidationError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  console.error(err);
  return Response.json({ error: "Internal error" }, { status: 500 });
}

export function notFound(what = "Not found"): Response {
  return Response.json({ error: what }, { status: 404 });
}
