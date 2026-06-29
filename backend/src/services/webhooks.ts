import { createHmac } from "node:crypto";

type WebhookEvent = {
  type: string;
  timestamp: string;
  payload: Record<string, unknown>;
};

const endpoints = (process.env.WEBHOOK_ENDPOINTS ?? "")
  .split(",")
  .map((url) => url.trim())
  .filter((url) => url.length > 0);
const secret = process.env.WEBHOOK_SECRET ?? "";

function signBody(body: string): string {
  if (!secret) return "";
  return createHmac("sha256", secret).update(body).digest("hex");
}

export async function publishWebhook(
  type: string,
  payload: Record<string, unknown>,
): Promise<void> {
  if (endpoints.length === 0) {
    return;
  }
  const event: WebhookEvent = {
    type,
    timestamp: new Date().toISOString(),
    payload,
  };
  const body = JSON.stringify(event);
  const signature = signBody(body);
  await Promise.allSettled(
    endpoints.map((url) =>
      fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(signature ? { "X-Veilio-Signature": signature } : {}),
        },
        body,
      }),
    ),
  );
}
