import { readFileSync } from "node:fs";
import { createLedgerToken } from "./jwt.js";
import { getCantonAccessToken } from "./oauth-token.js";
import { config } from "../config.js";

export async function getCantonAuthHeaders(
  actAs: string[] = [],
): Promise<Record<string, string>> {
  const token = await getCantonAccessToken();
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  if (config.canton.useJwt) {
    return { Authorization: `Bearer ${createLedgerToken(actAs, actAs)}` };
  }
  return {};
}

export function loadClientCertificate(): { cert: Buffer; key: Buffer } | null {
  const certPath = config.canton.tlsCertPath;
  const keyPath = config.canton.tlsKeyPath;
  if (!certPath || !keyPath) {
    return null;
  }
  return {
    cert: readFileSync(certPath),
    key: readFileSync(keyPath),
  };
}
