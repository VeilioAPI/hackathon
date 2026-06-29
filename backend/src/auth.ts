import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "./config.js";

export type AuthRole = "admin" | "partner" | "auditor";

export type AuthContext = {
  subject: string;
  hint?: string;
  partyId?: string;
  roles: AuthRole[];
};

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

type TokenClaims = {
  sub?: string;
  hint?: string;
  partyId?: string;
  role?: string;
  roles?: string[];
  aud?: string | string[];
  iss?: string;
};

function parseBearerToken(header?: string): string | null {
  if (!header) return null;
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

function normalizeRoles(claims: TokenClaims): AuthRole[] {
  const raw = [
    ...(Array.isArray(claims.roles) ? claims.roles : []),
    ...(claims.role ? [claims.role] : []),
  ];
  const allowed: AuthRole[] = ["admin", "partner", "auditor"];
  return raw.filter((role): role is AuthRole => allowed.includes(role as AuthRole));
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!config.security.authRequired) {
    req.auth = { subject: "anonymous-dev", roles: ["admin"] };
    next();
    return;
  }

  const token = parseBearerToken(req.header("authorization"));
  if (!token) {
    res.status(401).json({ error: "Missing bearer token" });
    return;
  }

  try {
    const decoded = jwt.verify(token, config.security.jwtSecret, {
      audience: config.security.jwtAudience,
      issuer: config.security.jwtIssuer,
    }) as TokenClaims;
    const roles = normalizeRoles(decoded);
    req.auth = {
      subject: decoded.sub ?? "unknown",
      hint: decoded.hint,
      partyId: decoded.partyId,
      roles: roles.length > 0 ? roles : ["partner"],
    };
    next();
  } catch (error) {
    res.status(401).json({
      error: error instanceof Error ? error.message : "Invalid authentication token",
    });
  }
}

export function requireRole(roles: AuthRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ctx = req.auth;
    if (!ctx) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    if (!ctx.roles.some((role) => roles.includes(role))) {
      res.status(403).json({ error: "Insufficient role" });
      return;
    }
    next();
  };
}

export function hintForRequest(req: Request, fallback?: string): string {
  const authHint = req.auth?.hint?.trim();
  if (authHint) {
    if (fallback && fallback.trim() && fallback.trim() !== authHint) {
      throw new Error("request hint does not match authenticated identity");
    }
    return authHint;
  }
  if (!fallback || !fallback.trim()) {
    throw new Error("requester hint is required");
  }
  return fallback.trim();
}
