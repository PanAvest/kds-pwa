// app/api/ebooks/[slug]/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const Ebook = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  cover_url: z.string().url().nullable().optional(),
  sample_url: z.string().url().nullable().optional(),
  kpf_url: z.string().url().nullable().optional(),
  price_cents: z.number().int(),
  published: z.boolean()
});

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ slug: string }> }
) {
  const { slug } = await ctx.params;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data, error } = await supabase
    .from("ebooks")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const parsed = Ebook.safeParse(data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid ebook shape", issues: parsed.error.issues },
      { status: 500 }
    );
  }

  return NextResponse.json(parsed.data, { status: 200 });
}
