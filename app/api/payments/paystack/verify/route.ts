// File: app/api/payments/paystack/verify/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import {
  fetchPaystackVerification,
  grantSuccessfulPaystackCharge,
} from "../_server";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const reference = searchParams.get("reference");
    if (!reference) return NextResponse.json({ ok: false, error: "Missing reference" }, { status: 400 });

    const j = await fetchPaystackVerification(reference);

    if (!j?.status || j?.data?.status !== "success") {
      return NextResponse.json({ ok: false, error: "Not successful (yet)" }, { status: 400 });
    }

    const result = await grantSuccessfulPaystackCharge(j.data);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.status }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: (error as Error).message || "Verification failed." },
      { status: 500 }
    );
  }
}
