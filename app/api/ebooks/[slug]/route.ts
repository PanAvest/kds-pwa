// File: app/api/ebooks/[slug]/route.ts
export const dynamic = 'force-dynamic'
export const revalidate = 0
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

type RouteCtx = { params?: { slug?: string } };

export async function GET(_req: Request, ctx: unknown) {
  try {
    const { params } = (ctx as RouteCtx) || {};
    const slug = params?.slug;
    if (!slug) {
      return NextResponse.json({ error: 'Missing slug' }, { status: 400 });
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

    return NextResponse.json({ ebook: data }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Internal error' }, { status: 500 });
  }
}
