import type { NextFunction, Request, Response } from "express";
import { getIdempotencyResponse, saveIdempotencyResponse } from "../db/index.js";

export async function idempotencyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (req.method !== "POST" && req.method !== "PATCH" && req.method !== "DELETE") {
    next();
    return;
  }

  const key = req.header("Idempotency-Key");
  if (!key) {
    next();
    return;
  }

  const routeKey = `${req.method}:${req.path}`;
  const previous = await getIdempotencyResponse(key, routeKey);
  if (previous) {
    res.status(previous.statusCode).json(previous.responseJson);
    return;
  }

  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    void saveIdempotencyResponse({
      idempotencyKey: key,
      routeKey,
      statusCode: res.statusCode,
      responseJson: body,
    });
    return originalJson(body);
  }) as typeof res.json;

  next();
}
