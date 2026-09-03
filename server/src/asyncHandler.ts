import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Express 4 doesn't catch errors thrown inside async route handlers — an
 * unhandled rejection there crashes the whole process, taking down every
 * request in flight, not just the failing one. Wrapping a handler with this
 * routes its errors to Express's error middleware instead.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
