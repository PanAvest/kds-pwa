// File: app/api/ebooks/route.ts
export const dynamic = 'force-dynamic'
export const revalidate = 0
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    const limit = Math.min(Number(searchParams.get("limit") || 24), 48);
    const offset = Math.max(Number(searchParams.get("offset") || 0), 0);

    const supabase = getSupabaseAdmin();

    let query = supabase
      .from("ebooks")
      .select("id, slug, title, description, cover_url, price_cents, published", { count: "exact" })
      .eq("published", true)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (q) query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%`);

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json(data ?? []);
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to load e-books" }, { status: 500 });
  }
}
