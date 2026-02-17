export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

function supabaseForToken(accessToken: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, anon, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim().toLowerCase();

    // Resolve user token from bearer header first, then cookie fallback.
    const authHeader = req.headers.get("authorization") || "";
    let token = "";
    if (authHeader.toLowerCase().startsWith("bearer ")) {
      token = authHeader.slice(7).trim();
    }
    if (!token) {
      const jar = await cookies();
      token = jar.get("sb-access-token")?.value || "";
    }
    if (!token) return NextResponse.json([]);

    const authSb = supabaseForToken(token);
    const { data: userInfo, error: userErr } = await authSb.auth.getUser();
    if (userErr || !userInfo?.user) return NextResponse.json([]);

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("ebook_purchases")
      .select(
        "status, ebooks:ebook_id(id, slug, title, description, cover_url, price_cents, published)"
      )
      .eq("user_id", userInfo.user.id)
      .in("status", ["paid", "free"])
      .order("updated_at", { ascending: false });

    if (error) throw error;

    const mapped = (data ?? [])
      .map((row: any) => {
        const ebook = Array.isArray(row?.ebooks) ? row.ebooks[0] : row?.ebooks;
        if (!ebook || ebook.published !== true) return null;
        const title = String(ebook.title ?? "").toLowerCase();
        const description = String(ebook.description ?? "").toLowerCase();
        if (q && !title.includes(q) && !description.includes(q)) return null;
        return {
          id: ebook.id,
          slug: ebook.slug,
          title: ebook.title,
          description: ebook.description ?? null,
          cover_url: ebook.cover_url ?? null,
          price_cents: Number(ebook.price_cents ?? 0),
          published: true,
          linked_status: row?.status === "free" ? "free" : "paid",
        };
      })
      .filter(Boolean);

    const dedup = new Map<string, any>();
    for (const row of mapped) dedup.set(row.id, row);

    return NextResponse.json(Array.from(dedup.values()));
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "Failed to load e-books" },
      { status: 500 }
    );
  }
}
