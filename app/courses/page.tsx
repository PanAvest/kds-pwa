// app/knowledge/page.tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Course = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  img: string | null;
  cpd_points: number | null;
  published: boolean | null;
  created_at?: string | null;
};

const safeSrc = (src?: string | null) => (src && src.trim() ? src : "/icon-512.png");

export default function KnowledgePage() {
  const [all, setAll] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase
          .from("courses")
          .select("id,slug,title,description,img,cpd_points,published,created_at")
          .eq("published", true)
          .order("created_at", { ascending: false });
        if (!alive) return;
        setAll((data ?? []) as Course[]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return all;
    return all.filter(c =>
      (c.title?.toLowerCase().includes(needle)) ||
      (c.description?.toLowerCase().includes(needle)) ||
      (c.slug?.toLowerCase().includes(needle))
    );
  }, [all, q]);

  const list: (Course | null)[] =
    loading ? Array.from({ length: 6 }, () => null) : filtered;

  return (
    <div className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8 py-8">
      <header className="mb-4">
        <h1 className="text-2xl font-extrabold tracking-tight text-[color:var(--color-text-dark)]">
          Knowledge
        </h1>
        <p className="text-sm text-[color:var(--color-text-muted)]">
          Browse PanAvest knowledge programs.
        </p>

        <div className="mt-4">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search knowledge…"
            className="w-full sm:w-[420px] rounded-xl border border-[color:var(--color-light)] bg-white px-4 py-2 outline-none focus:ring-2 focus:ring-[color:var(--color-accent-red)]/30"
          />
        </div>
      </header>

      <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((c, idx) => (
          <li key={c ? c.id : `s-${idx}`}>
            {c ? (
              <Link
                href={`/courses/${c.slug}`}
                className="group rounded-2xl bg-white border border-[color:var(--color-light)] hover:shadow-md transition overflow-hidden block"
              >
                <div className="relative w-full aspect-video bg-[color:var(--color-light)]/40">
                  {c.img ? (
                    <Image
                      src={safeSrc(c.img)}
                      alt={c.title}
                      fill
                      sizes="(max-width:1024px) 50vw, 33vw"
                      className="object-cover"
                    />
                  ) : (
                    <Image
                      src={safeSrc(null)}
                      alt="Placeholder"
                      fill
                      sizes="(max-width:1024px) 50vw, 33vw"
                      className="object-contain p-8"
                    />
                  )}
                </div>
                <div className="px-5 py-4">
                  <h3 className="font-semibold text-[17px] text-[color:var(--color-text-dark)] group-hover:opacity-90">
                    {c.title}
                  </h3>
                  <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                    CPPD Score: <b>{c.cpd_points ?? 0}</b>
                  </div>
                  {c.description && (
                    <p className="mt-2 text-sm text-[color:var(--color-text-muted)] line-clamp-2">
                      {c.description}
                    </p>
                  )}
                </div>
              </Link>
            ) : (
              <div className="rounded-2xl bg-white border border-[color:var(--color-light)] p-4">
                <div className="h-40 w-full rounded-xl bg-[color:var(--color-light)]/60 animate-pulse" />
                <div className="mt-3 h-4 w-2/3 rounded bg-[color:var(--color-light)]/80 animate-pulse" />
                <div className="mt-2 h-3 w-4/5 rounded bg-[color:var(--color-light)]/70 animate-pulse" />
              </div>
            )}
          </li>
        ))}
      </ul>

      <div className="h-16 sm:h-0" />
    </div>
  );
}
