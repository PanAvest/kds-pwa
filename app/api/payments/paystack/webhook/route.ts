// File: app/api/payments/paystack/webhook/route.ts
// Node runtime (for crypto) + always dynamic
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import crypto from "crypto";
import { grantSuccessfulPaystackCharge } from "../_server";

export async function POST(req: Request) {
  try {
    const secret = process.env.PAYSTACK_WEBHOOK_SECRET?.trim();
    if (!secret) {
      return NextResponse.json({ ok: false, error: "Missing PAYSTACK_WEBHOOK_SECRET" }, { status: 500 });
    }

    // Raw body is required for signature verification
    const raw = await req.text();
    const headerSig = req.headers.get("x-paystack-signature") || "";
    const sig = crypto.createHmac("sha512", secret).update(raw).digest("hex");
    if (sig !== headerSig) {
      return NextResponse.json({ ok: false, error: "Bad signature" }, { status: 401 });
    }

    const evt = JSON.parse(raw);

    // We care about successful charges
    if (evt?.event === "charge.success") {
      const result = await grantSuccessfulPaystackCharge(evt.data);
      if (!result.ok) {
        return NextResponse.json(
          { ok: false, error: result.error },
          { status: result.status }
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message || "Webhook processing failed." },
      { status: 500 }
    );
  }
}
