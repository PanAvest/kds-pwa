// File: app/api/payments/paystack/webhook/route.ts
// Node runtime (for crypto) + always dynamic
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

// ⚠️ service role key (server-only). Do NOT expose client-side.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const secret = process.env.PAYSTACK_WEBHOOK_SECRET!;
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
      const data = evt.data || {};
      const meta = data.metadata || {};
      if (meta.kind === "course" && meta.user_id && meta.course_id) {
        // Idempotent unlock (requires unique index on (user_id, course_id); see SQL below)
        await supabase
          .from("enrollments")
          .upsert(
            {
              user_id: meta.user_id,
              course_id: meta.course_id,
              paid: true,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id,course_id" }
          );
      } else if (meta.kind === "ebook" && meta.user_id && meta.ebook_id) {
        await supabase
          .from("ebook_purchases")
          .upsert(
            {
              user_id: meta.user_id,
              ebook_id: meta.ebook_id,
              status: "paid",
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id,ebook_id" }
          );
      }

      // Optional audit log (create table if you like)
      await supabase.from("payments").insert({
        provider: "paystack",
        reference: data.reference,
        user_id: meta.user_id,
        amount_minor: data.amount,
        currency: data.currency,
        status: "success",
        meta,
        created_at: new Date().toISOString(),
      });
    }

    // Always respond quickly so Paystack doesn’t retry needlessly
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    // Return 200 so Paystack doesn’t hammer retries; log server-side if needed
    return NextResponse.json({ ok: true, note: "swallowed-error" });
  }
}
