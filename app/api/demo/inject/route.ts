import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { getClock } from "@/lib/clock";

export const dynamic = "force-dynamic";

/**
 * Plant a vendor message.
 *
 * This is the attack surface, exposed deliberately. A judge types whatever they
 * like into a vendor's inbox and the agent reads it as part of its evidence
 * bundle — because that is what happens in reality when an agent reads vendor
 * email.
 *
 * The message is stored as DATA and marked `injected: true`. The policy engine
 * never reads it. That asymmetry is the entire demo: the model can be fooled,
 * the ceiling cannot be argued with.
 */
export async function POST(request: Request) {
  let body: {
    vendorId?: unknown;
    subject?: unknown;
    message?: unknown;
    from?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (typeof body.vendorId !== "string" || typeof body.message !== "string") {
    return NextResponse.json(
      { error: "vendorId and message are required" },
      { status: 400 },
    );
  }
  if (body.message.trim().length === 0) {
    return NextResponse.json({ error: "message is empty" }, { status: 400 });
  }

  const vendor = await db.vendor.findUnique({ where: { id: body.vendorId } });
  if (!vendor) {
    return NextResponse.json({ error: "unknown vendor" }, { status: 404 });
  }

  const clock = await getClock();

  const created = await db.inboundMessage.create({
    data: {
      vendorId: vendor.id,
      receivedAt: clock,
      fromAddr:
        typeof body.from === "string" && body.from.trim().length > 0
          ? body.from
          : `billing@${vendor.name.toLowerCase().replace(/[^a-z0-9]/g, "")}.example`,
      subject:
        typeof body.subject === "string" && body.subject.trim().length > 0
          ? body.subject
          : "Account notice",
      body: body.message,
      injected: true,
    },
    select: { id: true },
  });

  return NextResponse.json({
    ok: true,
    messageId: created.id,
    vendor: vendor.name,
    note: "Stored as untrusted data. The agent will read it; the policy engine will not.",
  });
}

export async function DELETE() {
  const removed = await db.inboundMessage.deleteMany({
    where: { injected: true },
  });
  return NextResponse.json({ ok: true, removed: removed.count });
}
