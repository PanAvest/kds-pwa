"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { isIOSApp } from "@/lib/platform";

type Ebook = {
  id: string;
  slug: string;
  title: string;
  description?: string | null;
  cover_url?: string | null;
  price_cents: number;
  published: boolean;
};

export default function Ebooks() {
  const router = useRouter();
  const sp = useSearchParams();
  const qParam = sp.get("q") ?? "";
  const isIOS = useMemo(() => isIOSApp(), []);

  const [q, setQ] = useState(qParam);
  const [items, setItems] = useState<Ebook[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Keep input synced when user goes back
  useEffect(() => setQ(qParam), [qParam]);

  // Fetch list whenever the URL (?q=) changes
  useEffect(() => {
    (async () => {
      setLoading(true); setErr(null);
      try {
        const r = await fetch(`/api/ebooks${qParam ? `?q=${encodeURIComponent(qParam)}` : ""}`, { cache: "no-store" });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || r.statusText);
        setItems(Array.isArray(j) ? j : []);
      } catch (e) {
        setErr((e as Error).message);
        setItems([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [qParam]);

  const headerNote = useMemo(() => {
    if (loading) return "Searching…";
    if (items && qParam) return `${items.length} result${items.length === 1 ? "" : "s"} for “${qParam}”`;
    if (items) return `${items.length} title${items.length === 1 ? "" : "s"}`;
    return "";
  }, [items, loading, qParam]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const params = new URLSearchParams(sp.toString());
    if (q.trim()) params.set("q", q.trim());
    else params.delete("q");
    router.push(`/ebooks${params.toString() ? `?${params}` : ""}`); // no replace -> avoids race
  }

  return (
    <main className="mx-auto max-w-screen-xl px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">E-Books</h1>
          <p className="mt-1 text-muted max-w-2xl text-sm sm:text-base">
            {isIOS
              ? "On iOS, this app lets you sign in and access e-books you have already obtained through KDS Learning elsewhere."
              : "Buy to unlock reading. Your purchases appear in the Dashboard."}
          </p>
        </div>

        {/* Plain GET form — no debounced effects */}
        <form onSubmit={onSubmit} action="/ebooks" method="GET" className="w-full sm:w-[340px]" role="search">
          <label className="block text-xs font-medium text-muted mb-1">Search e-books</label>
          <input
            name="q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by title or description…"
            className="w-full rounded-xl border border-[color:var(--color-light)] bg-white px-4 py-2.5 outline-none focus:ring-2 focus:ring-[var(--color-brand)]"
            inputMode="search"
          />
          <div className="mt-1 text-[11px] text-muted">{headerNote}</div>
        </form>
      </div>

      {err && <div className="mt-4 text-red-600 text-sm">Error: {err}</div>}

      {(loading && !items) && (
        <div className="mt-6 grid gap-4 grid-cols-2 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-2xl bg-white border border-light p-4 animate-pulse h-[220px]" />
          ))}
        </div>
      )}

      {items && (
        <div className="mt-6 grid gap-4 grid-cols-2 sm:grid-cols-3">
          {items.map((b) => (
            <Link
              key={b.id}
              href={`/ebooks/${encodeURIComponent(b.slug)}`}
              prefetch={false} // extra safety to avoid prefetch/hydration edge cases
              className="group rounded-2xl bg-white border border-light hover:shadow-sm transition overflow-hidden flex flex-col"
            >
              <div className="bg-white border-b border-light">
                {b.cover_url ? (
                  <Image
                    src={b.cover_url}
                    alt={b.title}
                    width={800}
                    height={600}
                    className="w-full h-[150px] sm:h-[180px] object-cover"
                  />
                ) : (
                  <div className="w-full h-[150px] sm:h-[180px] bg-[color:var(--color-light)]/40 grid place-items-center text-muted text-sm">
                    No cover
                  </div>
                )}
              </div>
              <div className="px-4 py-3 flex-1 flex flex-col">
                <h3 className="font-semibold text-base text-ink group-hover:text-brand line-clamp-2">
                  {b.title}
                </h3>
                <p className="mt-1 text-xs text-muted line-clamp-2">
                  {b.description ?? "No description yet."}
                </p>
                <div className="mt-auto pt-2 text-sm font-medium">
                  GH₵ {(b.price_cents / 100).toFixed(2)}
                </div>
              </div>
            </Link>
          ))}
          {!loading && items.length === 0 && (
            <div className="text-sm text-muted mt-6">No books found.</div>
          )}
        </div>
      )}
    </main>
  );
}
