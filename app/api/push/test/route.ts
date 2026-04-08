// File: app/api/push/test/route.ts
import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const runtime = "edge"
export async function POST(){
  return NextResponse.json(
    { ok: false, error: "Push notifications are disabled for this release." },
    { status: 503 }
  );
}
