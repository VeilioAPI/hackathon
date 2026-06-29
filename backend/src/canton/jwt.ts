import jwt from "jsonwebtoken";
import { config } from "../config.js";

export function createLedgerToken(actAs: string[], readAs: string[] = actAs): string {
  const payload = {
    sub: "veilio-backend",
    "https://daml.com/ledger-api": {
      applicationId: "veilio-exchange",
      actAs,
      readAs,
    },
  };

  return jwt.sign(payload, config.canton.jwtSecret, {
    algorithm: "HS256",
    audience: config.canton.jwtAudience,
    expiresIn: "1h",
  });
}
