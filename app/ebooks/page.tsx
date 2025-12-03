"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import NoInternet, { useOfflineMonitor } from "@/components/NoInternet";
import { isNativeApp, isNativeIOSApp } from "@/lib/nativePlatform";
import { supabase } from "@/lib/supabaseClient";

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
  const native = useMemo(() => isNativeApp(), []);
  const isIOS = useMemo(() => isNativeIOSApp(), []);
  const { isOffline, markOffline, markOnline } = useOfflineMonitor();

  const [q, setQ] = useState(qParam);
  const [items, setItems] = useState<Ebook[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ownedIds, setOwnedIds] = useState<Set<string>>(new Set());

  // Keep input synced when user goes back
  useEffect(() => setQ(qParam), [qParam]);

  // Load owned ebooks to mark availability in reader mode
  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!active) return;
      if (!user) { setOwnedIds(new Set()); return; }
      const { data, error } = await supabase
        .from("ebook_purchases")
        .select("ebook_id, status")
        .eq("user_id", user.id)
        .eq("status", "paid");
      if (!active) return;
      if (error || !data) { setOwnedIds(new Set()); return; }
      setOwnedIds(new Set(data.map((row) => row.ebook_id)));
    })();
    return () => { active = false; };
  }, []);

  // Fetch list whenever the URL (?q=) changes
  useEffect(() => {
    (async () => {
      setLoading(true); setErr(null);
      try {
        const r = await fetch(`/api/ebooks${qParam ? `?q=${encodeURIComponent(qParam)}` : ""}`, { cache: "no-store" });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || r.statusText);
        setItems(Array.isArray(j) ? j : []);
        markOnline();
      } catch (e) {
        setErr((e as Error).message);
        setItems([]);
        markOffline();
      } finally {
        setLoading(false);
      }
    })();
  }, [qParam, markOffline, markOnline]);

  const filteredItems = useMemo(() => {
    if (!items) return null;
    const list = native ? items.filter((b) => ownedIds.has(b.id)) : items;
    return list;
  }, [items, native, ownedIds]);

  const headerNote = useMemo(() => {
    if (loading) return "Searching…";
    if (filteredItems && qParam) return `${filteredItems.length} result${filteredItems.length === 1 ? "" : "s"} for “${qParam}”`;
    if (filteredItems) return `${filteredItems.length} title${filteredItems.length === 1 ? "" : "s"}`;
    return "";
  }, [filteredItems, loading, qParam]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const params = new URLSearchParams(sp.toString());
    if (q.trim()) params.set("q", q.trim());
    else params.delete("q");
    router.push(`/ebooks${params.toString() ? `?${params}` : ""}`); // no replace -> avoids race
  }

  return (
    <NoInternet forceOffline={isOffline}>
    <main className="mx-auto max-w-screen-xl px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">E-Books</h1>
          <p className="mt-1 text-muted max-w-2xl text-sm sm:text-base">
            {isIOS
              ? "This mobile app is a companion reader for the PanAvest KDS platform. Manage purchases on the web portal at www.panavestkds.com; sign in here to open items already on your account."
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

      {filteredItems && (
        <div className="mt-6 grid gap-4 grid-cols-2 sm:grid-cols-3">
          {filteredItems.map((b) => (
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
                {native ? null : (
                  <div className="mt-auto pt-2 text-sm font-medium">
                    GH₵ {(b.price_cents / 100).toFixed(2)}
                  </div>
                )}
              </div>
            </Link>
          ))}
          {!loading && filteredItems.length === 0 && (
            <div className="text-sm text-muted mt-6">No books found.</div>
          )}
        </div>
      )}
      {native && filteredItems && filteredItems.length === 0 && !loading && (
        <div className="mt-8 rounded-xl border border-amber-200 bg-amber-50 px-4 py-5 text-amber-900">
          <div className="font-semibold">No e-books are available in this mobile app yet.</div>
          <p className="mt-1 text-sm">
            Add e-books to your PanAvest KDS account on www.panavestkds.com, then sign in here to read them.
          </p>
        </div>
      )}
    </main>
    </NoInternet>
  );
}
