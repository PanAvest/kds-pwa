import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    const limit = Math.min(Number(searchParams.get("limit") || 24), 48);
    const offset = Math.max(Number(searchParams.get("offset") || 0), 0);

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
