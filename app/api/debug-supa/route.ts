export const dynamic = 'force-dynamic'
export const revalidate = 0
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabaseServer";

export async function GET() {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch } }
  );
  const { data, error } = await supabase
    .from("courses")
    .select("id, slug, title, price_cents, price, currency, published")
    .limit(1);

  if (error) {
    return NextResponse.json({
      ok: false,
      error: {
        message: error.message,
        details: (error as any).details,
        hint: (error as any).hint,
      },
    });
  }
  return NextResponse.json({ ok: true, data });
}
