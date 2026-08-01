import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { now } from "@/lib/clock";

export const dynamic = "force-dynamic";

/**
 * Inject a message into a vendor's inbox.
 *
 * This is the attack surface, and it is deliberately not special: the message
 * lands in the same table real vendor messages land in, and the evidence
 * builder picks it up the same way. There is no "attack mode" the pipeline
 * knows about.
 *
 * The one thing the injected message carries that a real one does not is
 * `injected: true`, and that flag exists to make the demo *more* honest rather
 * than less — the vendors page labels it, and a ledger entry produced from it
 * can say the proposal was triggered by injected content. Hiding the flag
 * would make the attack look more impressive and the system less trustworthy.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let vendorId: string;
  let subject: string;
  let body: string;

  try {
    const payload = (await request.json()) as {
      vendorId?: unknown;
      subject?: unknown;
      body?: unknown;
    };
    if (typeof payload.vendorId !== "string" || !payload.vendorId.trim()) {
      return NextResponse.json({ error: "vendorId is required" }, { status: 400 });
    }
    if (typeof payload.body !== "string" || !payload.body.trim()) {
      return NextResponse.json({ error: "body is required" }, { status: 400 });
    }
    vendorId = payload.vendorId.trim();
    subject =
      typeof payload.subject === "string" && payload.subject.trim()
        ? payload.subject.trim().slice(0, 200)
        : "(no subject)";
    body = payload.body.slice(0, 4000);
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
  if (!vendor) {
    return NextResponse.json({ error: "no such vendor" }, { status: 404 });
  }

  const instant = await now();

  const message = await prisma.vendorMessage.create({
    data: {
      vendorId,
      receivedAt: instant,
      subject,
      body,
      injected: true,
    },
  });

  return NextResponse.json({
    ok: true,
    messageId: message.id,
    note: "Injected into the vendor inbox. The next tick will read it as ordinary evidence.",
  });
}
