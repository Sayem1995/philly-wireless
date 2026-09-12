import { afterEach, describe, expect, it, vi } from "vitest";
import { isSmsConfigured, sendSms, toE164 } from "../server/sms.js";

const ENV_KEYS = ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER"] as const;

function clearSmsEnv() {
  for (const k of ENV_KEYS) delete process.env[k];
}

function setSmsEnv() {
  process.env.TWILIO_ACCOUNT_SID = "ACtest123";
  process.env.TWILIO_AUTH_TOKEN = "token456";
  process.env.TWILIO_FROM_NUMBER = "+12155550123";
}

afterEach(() => {
  clearSmsEnv();
  vi.unstubAllGlobals();
});

describe("toE164", () => {
  it("accepts an already-normalised number", () => {
    expect(toE164("+12155550123")).toBe("+12155550123");
  });

  it("converts 10-digit US numbers", () => {
    expect(toE164("2155550123")).toBe("+12155550123");
    expect(toE164("(215) 555-0123")).toBe("+12155550123");
    expect(toE164("814-384-1507")).toBe("+18143841507");
  });

  it("handles an 11-digit number with a leading country code", () => {
    expect(toE164("12155550123")).toBe("+12155550123");
  });

  it("rejects unusable input", () => {
    expect(toE164("")).toBeNull();
    expect(toE164(null)).toBeNull();
    expect(toE164(undefined)).toBeNull();
    expect(toE164("12345")).toBeNull();
  });
});

describe("sendSms without configuration", () => {
  it("reports not-delivered instead of throwing", async () => {
    clearSmsEnv();
    expect(isSmsConfigured()).toBe(false);
    await expect(sendSms({ to: "2155550123", body: "hi" })).resolves.toEqual({
      delivered: false,
    });
  });

  it("does not attempt a network call", async () => {
    clearSmsEnv();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await sendSms({ to: "2155550123", body: "hi" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("treats an unparseable number as not-delivered", async () => {
    setSmsEnv();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(sendSms({ to: "n/a", body: "hi" })).resolves.toEqual({ delivered: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("sendSms when configured", () => {
  it("posts the message to Twilio with basic auth", async () => {
    setSmsEnv();
    expect(isSmsConfigured()).toBe(true);

    const fetchSpy = vi.fn(async () => new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetchSpy);

    await expect(sendSms({ to: "(215) 555-0123", body: "Your repair is ready" })).resolves.toEqual({
      delivered: true,
    });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.twilio.com/2010-04-01/Accounts/ACtest123/Messages.json");
    expect(String((init.headers as Record<string, string>).Authorization)).toMatch(/^Basic /);
    const body = new URLSearchParams(String(init.body));
    expect(body.get("To")).toBe("+12155550123");
    expect(body.get("From")).toBe("+12155550123");
    expect(body.get("Body")).toBe("Your repair is ready");
  });

  it("throws on a provider error so the caller can record the failure", async () => {
    setSmsEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ message: "bad number" }), { status: 400 })),
    );
    await expect(sendSms({ to: "2155550123", body: "hi" })).rejects.toThrow(/Twilio error 400/);
  });
});
