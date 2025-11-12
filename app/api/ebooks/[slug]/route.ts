export const dynamic = 'force-dynamic'
export const revalidate = 0
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type RouteCtx = { params?: { slug?: string } };

export async function GET(_req: Request, ctx: unknown) {
  try {
    const { params } = (ctx as RouteCtx) || {};
    const slug = params?.slug;
    if (!slug) {
      return NextResponse.json({ error: 'Missing slug' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('ebooks')
      .select('*')
      .eq('slug', slug)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({ ebook: data }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Internal error' }, { status: 500 });
  }
}
