import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ZodError } from "zod";

/**
 * Errors carry a machine code as well as a message, because the apps run in
 * English and French and must not show a server's English sentence to a rider.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "invalid_request",
        message: "Some fields are missing or wrong.",
        details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
    });
    return;
  }
  const message = err instanceof Error ? err.message : "Unknown error";
  res.status(500).json({ error: { code: "internal_error", message } });
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: { code: "not_found", message: "No such endpoint." } });
}

/**
 * Read a route parameter that must be there.
 *
 * Express types every param as possibly-undefined, and under strict settings
 * that is right: a mounted router can be reached without one. Better to answer
 * 400 than to hand `undefined` to a query and get a confusing 500.
 */
export function param(req: Request, name: string): string {
  const value = req.params[name];
  if (!value) throw new ApiError(400, "missing_param", `This request is missing ${name}.`);
  return value;
}
