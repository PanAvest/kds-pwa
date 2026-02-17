// File: app/api/ebooks/[slug]/route.ts
export const dynamic = 'force-dynamic'
export const revalidate = 0
import { NextResponse } from 'next/server';
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

type RouteCtx = { params?: { slug?: string } };

function supabaseForToken(accessToken: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export async function GET(req: Request, ctx: unknown) {
  try {
    const { params } = (ctx as RouteCtx) || {};
    const slug = params?.slug;
    if (!slug) {
      return NextResponse.json({ error: 'Missing slug' }, { status: 400 });
    }

    const authHeader = req.headers.get("authorization") || "";
    let token = "";
    if (authHeader.toLowerCase().startsWith("bearer ")) {
      token = authHeader.slice(7).trim();
    }
    if (!token) {
      const jar = await cookies();
      token = jar.get("sb-access-token")?.value || "";
    }
    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const authSb = supabaseForToken(token);
    const { data: userInfo, error: userErr } = await authSb.auth.getUser();
    if (userErr || !userInfo?.user) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('ebooks')
      .select('*')
      .eq('slug', slug)
      .eq('published', true)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { data: linked, error: linkErr } = await supabase
      .from("ebook_purchases")
      .select("status")
      .eq("user_id", userInfo.user.id)
      .eq("ebook_id", data.id)
      .in("status", ["paid", "free"])
      .maybeSingle();
    if (linkErr) return NextResponse.json({ error: linkErr.message }, { status: 500 });
    if (!linked) return NextResponse.json({ error: "Not linked" }, { status: 403 });

    return NextResponse.json({ ebook: data }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Internal error' }, { status: 500 });
  }
}
