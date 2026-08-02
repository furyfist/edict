import type { Rails } from "@/lib/config/rails";
import type { Tone } from "@/app/_lib/tone";

/**
 * Rails state → the sidebar's environment pill.
 *
 * Short enough to sit beside the wordmark, and toned through the same map as
 * everything else, so "production" cannot end up quieter than "sandbox" by
 * accident. It is derived from the credential and the host — never from a flag
 * set alongside them.
 */
export function railsChip(rails: Rails): { label: string; tone: Tone } {
  switch (rails) {
    case "PRODUCTION":
      return { label: "production", tone: "high" };
    case "MISCONFIGURED":
      return { label: "misconfigured", tone: "high" };
    case "SANDBOX":
      return { label: "sandbox", tone: "medium" };
    default:
      return { label: "mock", tone: "neutral" };
  }
}
