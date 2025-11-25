// app/api/ebooks/route.ts
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

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data, error } = await supabase
    .from("ebooks")
    .select("*")
    .eq("published", true)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const parsed = z.array(Ebook).safeParse(data ?? []);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid ebooks shape", issues: parsed.error.issues },
      { status: 500 }
    );
  }

  return NextResponse.json(parsed.data, { status: 200 });
}
