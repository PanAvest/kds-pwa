// File: app/api/vouchers/validate/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { validateVoucher } from "@/lib/vouchers";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    code?: unknown;
    subtotal_cents?: unknown;
  };

  const code = typeof body.code === "string" ? body.code : "";
  const subtotal =
    typeof body.subtotal_cents === "number" && Number.isFinite(body.subtotal_cents)
      ? Math.max(0, Math.round(body.subtotal_cents))
      : NaN;

  if (!code || !Number.isFinite(subtotal)) {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const result = await validateVoucher(admin, code, subtotal);

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 200 });
  }

  return NextResponse.json({
    ok: true,
    code: result.voucher.code,
    discount_type: result.voucher.discount_type,
    discount_value: result.voucher.discount_value,
    discount_cents: result.discountCents,
    total_cents: Math.max(0, subtotal - result.discountCents),
    label: result.label,
  });
}
