import { NextResponse } from "next/server";
import { getPublicIdentity } from "@/lib/attest";

export const dynamic = "force-dynamic";

/**
 * The published public key.
 *
 * Separate from the bundle so a verifier has somewhere independent to pin
 * against. A bundle that carries its own key proves it is internally
 * consistent; comparing the key id to this endpoint is what proves it came
 * from us.
 *
 * Public by definition. The private half never leaves the server.
 */
export async function GET() {
  const identity = getPublicIdentity();

  if (!identity) {
    return NextResponse.json(
      {
        configured: false,
        message:
          "No signing key is configured. Entries are being written unattested.",
      },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  }

  return NextResponse.json(
    { configured: true, ...identity },
    { headers: { "cache-control": "no-store" } },
  );
}
