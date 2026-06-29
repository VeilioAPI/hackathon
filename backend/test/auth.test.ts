import { describe, expect, test } from "vitest";
import jwt from "jsonwebtoken";
import { hintForRequest } from "../src/auth.js";
import { mintDevToken } from "../src/auth/dev-token.js";

describe("auth helpers", () => {
  test("hintForRequest uses auth hint when present", () => {
    const req = { auth: { subject: "u1", hint: "bank-a", roles: ["partner"] } } as any;
    expect(hintForRequest(req, undefined)).toBe("bank-a");
  });

  test("hintForRequest rejects mismatch", () => {
    const req = { auth: { subject: "u1", hint: "bank-a", roles: ["partner"] } } as any;
    expect(() => hintForRequest(req, "bank-b")).toThrow(/does not match/i);
  });

  test("jwt library available for signing", () => {
    const token = jwt.sign({ sub: "u1", hint: "bank-a" }, "secret");
    expect(typeof token).toBe("string");
  });

  test("mintDevToken includes hint claim", () => {
    process.env.AUTH_JWT_SECRET = "test-secret";
    process.env.AUTH_JWT_AUDIENCE = "veilio-api";
    process.env.AUTH_JWT_ISSUER = "veilio-auth";
    const token = mintDevToken({ hint: "BankA", role: "partner" });
    const decoded = jwt.decode(token) as { hint?: string; roles?: string[] };
    expect(decoded.hint).toBe("BankA");
    expect(decoded.roles).toContain("partner");
  });
});
