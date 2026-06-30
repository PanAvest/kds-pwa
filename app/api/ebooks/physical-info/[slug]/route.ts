// File: app/api/ebooks/physical-info/[slug]/route.ts
// Public, lightweight e-book info for the "buy a physical copy" order form.
// No ownership gate — anyone may order a printed copy of a published book.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type RouteCtx = { params?: { slug?: string } };

export async function GET(_req: Request, ctx: unknown) {
  const { params } = (ctx as RouteCtx) || {};
  const slug = params?.slug;
  if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("ebooks")
    .select("*")
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const row = data as Record<string, unknown>;
  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;

  return NextResponse.json({
    id: String(row.id ?? ""),
    slug: String(row.slug ?? slug),
    title: typeof row.title === "string" ? row.title : "",
    cover_url: typeof row.cover_url === "string" ? row.cover_url : null,
    price_cents: num(row.price_cents) ?? 0,
    physical_price_cents: num(row.physical_price_cents),
    stock_quantity: num(row.stock_quantity),
    show_stock: row.show_stock === true,
  });
}
