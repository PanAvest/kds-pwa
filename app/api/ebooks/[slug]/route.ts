import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  try {
    const { data, error } = await admin
      .from("ebooks")
      .select("id, slug, title, description, cover_url, price_cents, published")
      .eq("slug", params.slug)
      .eq("published", true)
      .maybeSingle();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
