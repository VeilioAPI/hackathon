import { config } from "../config.js";
import { logger } from "../observability.js";

type TokenCache = {
  accessToken: string;
  expiresAtMs: number;
};

let cache: TokenCache | null = null;
let inflight: Promise<string> | null = null;

const REFRESH_BUFFER_MS = 5 * 60 * 1000;

function oauthConfigured(): boolean {
  const oauth = config.canton.oauth;
  return Boolean(oauth.tokenUrl && oauth.clientId && oauth.clientSecret);
}

export function isCantonOAuthConfigured(): boolean {
  return oauthConfigured();
}

export function invalidateCantonOAuthTokenCache(): void {
  cache = null;
}

async function fetchOAuthToken(): Promise<string> {
  const oauth = config.canton.oauth;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: oauth.clientId,
    client_secret: oauth.clientSecret,
    audience: oauth.audience || oauth.clientId,
    scope: oauth.scope,
  });

  const response = await fetch(oauth.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(config.canton.timeoutMs),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Canton OAuth token exchange failed (${response.status}): ${text}`);
  }

  const payload = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
  };

  if (!payload.access_token) {
    throw new Error("Canton OAuth token exchange returned no access_token");
  }

  const expiresInSec = Number(payload.expires_in ?? 28_800);
  cache = {
    accessToken: payload.access_token,
    expiresAtMs: Date.now() + expiresInSec * 1000,
  };

  logger.info(
    { expiresInSec },
    "Refreshed Canton OAuth access token",
  );

  return cache.accessToken;
}

export async function getCantonAccessToken(): Promise<string | null> {
  if (oauthConfigured()) {
    const refreshBufferMs = REFRESH_BUFFER_MS;
    if (cache && cache.expiresAtMs > Date.now() + refreshBufferMs) {
      return cache.accessToken;
    }

    if (inflight) {
      return inflight;
    }

    inflight = fetchOAuthToken().finally(() => {
      inflight = null;
    });
    return inflight;
  }

  if (config.canton.authBearerToken) {
    return config.canton.authBearerToken;
  }

  return null;
}
