import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import type { AuthRole } from "../auth.js";

export function mintDevToken(input: {
  hint: string;
  role?: AuthRole;
  subject?: string;
}): string {
  return jwt.sign(
    {
      sub: input.subject ?? input.hint,
      hint: input.hint,
      roles: [input.role ?? "partner"],
    },
    config.security.jwtSecret,
    {
      algorithm: "HS256",
      audience: config.security.jwtAudience,
      issuer: config.security.jwtIssuer,
      expiresIn: "12h",
    },
  );
}

export function devTokenRouter() {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!config.security.devTokenMint) {
      res.status(404).json({ error: "Dev token minting is disabled" });
      return;
    }

    const hint =
      typeof req.body?.hint === "string"
        ? req.body.hint.trim()
        : typeof req.query.hint === "string"
          ? req.query.hint.trim()
          : "";
    if (!hint) {
      res.status(400).json({ error: "hint is required" });
      return;
    }

    const roleRaw = typeof req.body?.role === "string" ? req.body.role : "partner";
    const role: AuthRole =
      roleRaw === "admin" || roleRaw === "auditor" ? roleRaw : "partner";

    try {
      const token = mintDevToken({ hint, role });
      res.json({
        token,
        hint,
        role,
        expiresIn: "12h",
      });
    } catch (error) {
      next(error);
    }
  };
}
