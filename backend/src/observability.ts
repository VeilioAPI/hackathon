import type { NextFunction, Request, Response } from "express";
import pino from "pino";
import pinoHttpImport from "pino-http";
import client from "prom-client";
import { config } from "./config.js";

export const logger = pino({ level: config.observability.requestLogLevel });
const pinoHttp: any = (pinoHttpImport as any).default ?? (pinoHttpImport as any);

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const requestDuration = new client.Histogram({
  name: "veilio_http_request_duration_ms",
  help: "HTTP request latency in milliseconds",
  buckets: [10, 25, 50, 100, 250, 500, 1000, 2000, 5000],
  labelNames: ["method", "route", "status_code"],
  registers: [register],
});

export const httpLogger = pinoHttp({ logger });

export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const started = process.hrtime.bigint();
  res.on("finish", () => {
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1_000_000;
    requestDuration.labels(req.method, req.path, String(res.statusCode)).observe(elapsedMs);
  });
  next();
}

export async function metricsSnapshot(): Promise<string> {
  return register.metrics();
}
