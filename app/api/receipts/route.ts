import { NextResponse } from "next/server";
import { buildBundle } from "@/lib/ledger/bundle";

export const dynamic = "force-dynamic";

/**
 * Export the ledger as a portable, self-verifying bundle.
 *
 *   GET /api/receipts              the whole chain
 *   GET /api/receipts?entry=<id>   one receipt
 *   GET /api/receipts?download=1   as a file attachment
 *
 * Deliberately unauthenticated. The ledger is already visible in the interface,
 * and the demand this endpoint has to satisfy is a judge typing the URL into
 * their own browser and getting something they can check without our help.
 *
 * Read-only. There is no POST here and there will not be one — nothing about
 * receipts should ever be a write path outside `appendEntry`.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const entryId = url.searchParams.get("entry") ?? undefined;

  const bundle = await buildBundle({ entryId });

  const filename = entryId
    ? `receipt-${entryId.slice(0, 8)}.json`
    : "spend-guardian-receipts.json";

  const headers: Record<string, string> = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  };

  if (url.searchParams.get("download")) {
    headers["content-disposition"] = `attachment; filename="${filename}"`;
  }

  return new NextResponse(JSON.stringify(bundle, null, 2), { headers });
}
