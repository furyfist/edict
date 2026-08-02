/**
 * WHICH RAILS ARE LIVE — decided once, from the credentials themselves.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS DERIVED AND NOT DECLARED
 *
 * The obvious design is an `PRAVA_ENV=production` flag. It is also the design
 * that eventually moves real money while a screen says "sandbox", because a
 * declaration and a credential are two facts that can disagree, and the one
 * that moves money is the credential.
 *
 * So nothing is declared. The environment is READ OFF the key prefix and the
 * API base, which are the things that actually determine where a charge lands.
 * A banner derived from the same source as the charge cannot lie about it.
 *
 * ---------------------------------------------------------------------------
 * MISCONFIGURATION HALTS. IT NEVER DEGRADES.
 *
 * A live key pointed at the sandbox host, or a test key pointed at production,
 * is not a state to muddle through. The adapter would fail authentication and
 * every charge would come back as an opaque error, on stage, with no
 * explanation — the failure mode most likely to be mistaken for "the network
 * declined it", which is the one sentence this product cannot afford to have
 * anyone doubt.
 *
 * `MISCONFIGURED` is therefore its own state, and the tick refuses to run in it.
 * ---------------------------------------------------------------------------
 */

export type Rails =
  /** No provider configured. The mock adapter runs; nothing reaches a network. */
  | "MOCK"
  /** Prava sandbox. Real API, real declines, no real money. */
  | "SANDBOX"
  /** Prava production. Real money. */
  | "PRODUCTION"
  /** The key and the host disagree. Nothing may run. */
  | "MISCONFIGURED";

export interface RailsState {
  rails: Rails;
  /** One line, written for whoever has to fix it at speed. */
  detail: string;
  /** True only for PRODUCTION. Gate anything irreversible on this. */
  live: boolean;
}

const SANDBOX_HOST = "sandbox.api.prava.space";

function classify(key: string | undefined, base: string): RailsState {
  const trimmed = key?.trim();

  if (!trimmed) {
    return {
      rails: "MOCK",
      detail:
        "No PRAVA_SECRET_KEY. The mock adapter is running — over-cap charges " +
        "still decline, but no passkey ceremony and no dashboard cross-check.",
      live: false,
    };
  }

  const isTestKey = trimmed.startsWith("sk_test_");
  const isLiveKey = trimmed.startsWith("sk_live_");
  const isSandboxHost = base.includes(SANDBOX_HOST);

  if (!isTestKey && !isLiveKey) {
    return {
      rails: "MISCONFIGURED",
      detail:
        "PRAVA_SECRET_KEY is set but is neither sk_test_ nor sk_live_. Refusing " +
        "to guess which rails that is.",
      live: false,
    };
  }

  if (isLiveKey && isSandboxHost) {
    return {
      rails: "MISCONFIGURED",
      detail:
        "A LIVE key (sk_live_) is pointed at the sandbox host. Set " +
        "PRAVA_API_BASE to the production endpoint, or use a test key.",
      live: false,
    };
  }

  if (isTestKey && !isSandboxHost) {
    return {
      rails: "MISCONFIGURED",
      detail:
        `A test key (sk_test_) is pointed at ${base}, which is not the sandbox ` +
        "host. Set PRAVA_API_BASE back to the sandbox, or use a live key.",
      live: false,
    };
  }

  if (isLiveKey) {
    return {
      rails: "PRODUCTION",
      detail: "Production rails. Charges move real money.",
      live: true,
    };
  }

  return {
    rails: "SANDBOX",
    detail: "Prava sandbox. Real API and real declines; no real money moves.",
    live: false,
  };
}

/**
 * The current rails.
 *
 * Read on every call rather than cached: the demo-day escape hatch is unsetting
 * a key and restarting, and a cached answer would outlive the restart in a
 * long-running process during a rehearsal.
 */
export function railsState(): RailsState {
  return classify(
    process.env.PRAVA_SECRET_KEY,
    process.env.PRAVA_API_BASE ?? `https://${SANDBOX_HOST}`,
  );
}

/** Test seam — classification is pure, so it can be exercised without env. */
export const __classifyRails = classify;
