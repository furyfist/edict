import { describe, expect, it } from "vitest";
import { __classifyRails as classify } from "./rails";

const SANDBOX = "https://sandbox.api.prava.space";
const PRODUCTION = "https://api.prava.space";

/**
 * The property under test is narrow and the whole point: **the banner and the
 * charge must be derived from the same fact.**
 *
 * Every case below is a way the two could have disagreed, and the dangerous
 * ones — a live key behind a sandbox banner — must be impossible rather than
 * merely unlikely.
 */

describe("which rails are live", () => {
  it("no key is the mock, and says why", () => {
    const state = classify(undefined, SANDBOX);
    expect(state.rails).toBe("MOCK");
    expect(state.live).toBe(false);
    expect(state.detail).toContain("mock adapter");
  });

  it("a test key on the sandbox host is the sandbox", () => {
    const state = classify("sk_test_abc123", SANDBOX);
    expect(state.rails).toBe("SANDBOX");
    expect(state.live).toBe(false);
  });

  it("a live key on the production host is production, and is marked live", () => {
    const state = classify("sk_live_abc123", PRODUCTION);
    expect(state.rails).toBe("PRODUCTION");
    expect(state.live).toBe(true);
  });

  it("a LIVE key on the sandbox host is a misconfiguration, not a sandbox", () => {
    // The dangerous direction. Silently treating this as "sandbox" would put a
    // reassuring amber banner on a screen holding a credential that moves real
    // money.
    const state = classify("sk_live_abc123", SANDBOX);
    expect(state.rails).toBe("MISCONFIGURED");
    expect(state.live).toBe(false);
    expect(state.detail).toContain("LIVE key");
  });

  it("a test key on a production host is also a misconfiguration", () => {
    // Harmless to the wallet, fatal to the demo: every charge would fail
    // authentication and look exactly like a network decline.
    const state = classify("sk_test_abc123", PRODUCTION);
    expect(state.rails).toBe("MISCONFIGURED");
    expect(state.detail).toContain("not the sandbox");
  });

  it("refuses to guess at an unrecognised key prefix", () => {
    const state = classify("pk_live_oops", PRODUCTION);
    expect(state.rails).toBe("MISCONFIGURED");
    expect(state.live).toBe(false);
  });

  it("never reports live for anything but production", () => {
    // `live` gates irreversible things. It must be false in every state where
    // we are not certain real money is reachable.
    for (const [key, base] of [
      [undefined, SANDBOX],
      ["sk_test_x", SANDBOX],
      ["sk_live_x", SANDBOX],
      ["sk_test_x", PRODUCTION],
      ["bogus", PRODUCTION],
    ] as Array<[string | undefined, string]>) {
      expect(classify(key, base).live, `${key} @ ${base}`).toBe(false);
    }
  });

  it("always explains itself", () => {
    // Whoever reads this is fixing it under time pressure.
    for (const [key, base] of [
      [undefined, SANDBOX],
      ["sk_test_x", SANDBOX],
      ["sk_live_x", PRODUCTION],
      ["sk_live_x", SANDBOX],
    ] as Array<[string | undefined, string]>) {
      expect(classify(key, base).detail.length).toBeGreaterThan(30);
    }
  });
});
