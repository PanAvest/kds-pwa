"use client";

export const dynamic = "force-dynamic";
export const dynamicParams = true;

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams, useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

/** ── Minimal PDF.js shapes ─────────────────────────────────────── */
type PdfPage = {
  getViewport: (opts: { scale: number }) => { width: number; height: number };
  render: (opts: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => { promise: Promise<void> };
};
type PdfDoc = { numPages: number; getPage(n: number): Promise<PdfPage> };
/** ─────────────────────────────────────────────────────────────── */

type Ebook = {
  id: string;
  slug: string;
  title: string;
  description?: string | null;
  cover_url?: string | null;
  // 👇 allow both number and string from Supabase / API
  price_cents: number | string | null;
  published: boolean;
};

type Ownership =
  | { kind: "loading" }
  | { kind: "signed_out" }
  | { kind: "owner" }
  | { kind: "not_owner" };

type FitMode = "fit-width" | "fixed";

/** Cache dynamic imports so we don't import repeatedly */
let pdfGetDocument: ((params: any) => { promise: Promise<any> }) | null = null;
let pdfWorkerOptions: { workerSrc: string } | null = null;

async function ensurePdfJsLoaded() {
  if (pdfGetDocument && pdfWorkerOptions) return;

  const pdf = (await import("pdfjs-dist")) as unknown as {
    getDocument: (params: any) => { promise: Promise<any> };
    GlobalWorkerOptions: { workerSrc: string };
  };

  pdfGetDocument = pdf.getDocument;
  pdfWorkerOptions = pdf.GlobalWorkerOptions;
  pdfWorkerOptions.workerSrc = "/vendor/pdf.worker.min.mjs";
}

export default function EbookDetailPage() {
  const router = useRouter();
  const search = useSearchParams();
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";

  const [ebook, setEbook] = useState<Ebook | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [own, setOwn] = useState<Ownership>({ kind: "loading" });
  const [userId, setUserId] = useState<string>("");
  const [email, setEmail] = useState<string>("");

  const [buying, setBuying] = useState(false);
  const [verifying, setVerifying] = useState<string | null>(null);

  // Reader
  const [pdfReady, setPdfReady] = useState(false);
  const [showReader, setShowReader] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [fitMode, setFitMode] = useState<FitMode>("fit-width");
  const [zoom, setZoom] = useState<number>(1);

  const MIN_ZOOM = 0.5;
  const MAX_ZOOM = 3;

  const readerWrapRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pagesRef = useRef<HTMLDivElement | null>(null);
  const pdfDocRef = useRef<PdfDoc | null>(null);
  const lastWRef = useRef<number>(0);

  // PDF worker: mark ready after dynamic import succeeds
  useEffect(() => {
    (async () => {
      try {
        await ensurePdfJsLoaded();
        setPdfReady(true);
      } catch {
        setPdfReady(false);
      }
    })();
  }, []);

  // Auth
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setUserId(""); setEmail(""); setOwn({ kind: "signed_out" }); return; }
      setUserId(user.id);
      setEmail(user.email ?? "");
    })();
  }, []);

  // Load ebook meta
  useEffect(() => {
    if (!slug) return;
    (async () => {
      try {
        const r = await fetch(`/api/ebooks/${encodeURIComponent(slug)}`, { cache: "no-store" });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || r.statusText);

        // 🔧 If API wraps in { ebook: {...} } use that, otherwise use j directly
        const raw = (j && typeof j === "object" && "ebook" in j) ? (j.ebook as Ebook) : (j as Ebook);

        setEbook(raw);
      } catch (e) { setErr((e as Error).message); }
    })();
  }, [slug]);

  // Ownership check
  useEffect(() => {
    (async () => {
      if (!ebook?.id) { setOwn({ kind: "loading" }); return; }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setOwn({ kind: "signed_out" }); return; }
      const { data, error } = await supabase
        .from("ebook_purchases")
        .select("status")
        .eq("user_id", user.id)
        .eq("ebook_id", ebook.id)
        .maybeSingle();
      if (error || !data) { setOwn({ kind: "not_owner" }); return; }
      setOwn(data.status === "paid" ? { kind: "owner" } : { kind: "not_owner" });
    })();
  }, [ebook?.id]);

  // Paystack return (?reference)
  useEffect(() => {
    const ref = search.get("reference") || search.get("trxref") || null;
    if (!ref || !ebook?.id || !userId) return;

    let stop = false;
    setVerifying(ref);

    (async () => {
      try {
        await fetch(`/api/payments/paystack/verify?reference=${encodeURIComponent(ref)}`, { cache: "no-store" });
      } catch {}

      for (let i = 0; i < 15 && !stop; i++) {
        try {
          const { data, error } = await supabase
            .from("ebook_purchases")
            .select("status")
            .eq("user_id", userId)
            .eq("ebook_id", ebook.id)
            .maybeSingle();
          const ok = !error && data?.status === "paid";
          if (ok) { setOwn({ kind: "owner" }); setVerifying(null); router.replace(`/ebooks/${encodeURIComponent(slug)}`); return; }
        } catch {}
        await new Promise((r) => setTimeout(r, 1500));
      }
      setVerifying(null);
    })();

    return () => { stop = true; };
  }, [search, ebook?.id, userId, slug, router]);

  // 🔧 Safe price calculation (prevents NaN)
  const price = useMemo(() => {
    if (!ebook) return "";

    const raw = ebook.price_cents;

    // Convert whatever comes from DB/API to a safe number
    const numeric = typeof raw === "number"
      ? raw
      : raw == null
        ? NaN
        : Number(raw);

    if (!Number.isFinite(numeric)) {
      // fall back so UI doesn't show NaN
      return "GH₵ 0.00";
    }

    return `GH₵ ${(numeric / 100).toFixed(2)}`;
  }, [ebook]);

  // Start Paystack
  async function handleBuy() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push(`/auth/sign-in?redirect=${encodeURIComponent(`/ebooks/${slug}`)}`);
      return;
    }
    if (!ebook || !email) return;

    setBuying(true);
    try {
      // 🔧 use the same safe price parsing here too
      const raw = ebook.price_cents;
      const numeric = typeof raw === "number" ? raw : Number(raw ?? 0);
      const amountMinor = Math.round(Number.isFinite(numeric) ? numeric : 0);

      const res = await fetch("/api/payments/paystack/init", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email, amountMinor,
          meta: { kind: "ebook", user_id: user.id, ebook_id: ebook.id, slug: ebook.slug },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.authorization_url) throw new Error(data?.error || "Failed to initialize payment.");
      window.location.href = data.authorization_url;
    } catch (e) {
      setErr((e as Error).message || "Payment init failed");
      setBuying(false);
    }
  }

  // Secure PDF — dynamic PDF.js usage
  const ensurePdfDoc = useCallback(async (): Promise<PdfDoc | null> => {
    if (!ebook?.id) return null;
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) { setRenderError("You must be signed in to read this e-book."); return null; }

    const res = await fetch(`/api/secure-pdf?ebookId=${encodeURIComponent(ebook.id)}`, {
      headers: { Authorization: `Bearer ${token}` }, cache: "no-store"
    });
    if (res.status === 401) { setRenderError("Sign in again."); return null; }
    if (res.status === 403) { setRenderError("Please purchase to unlock."); return null; }
    if (!res.ok) { setRenderError(`Secure PDF failed: ${res.status}`); return null; }

    const buf = await res.arrayBuffer();

    await ensurePdfJsLoaded();
    const task = pdfGetDocument!({ data: buf } as any);
    const doc = (await task.promise) as unknown as PdfDoc;
    pdfDocRef.current = doc;
    return doc;
  }, [ebook?.id]);

  const renderPdf = useCallback(async () => {
    if (!pagesRef.current || !scrollRef.current) return;
    const pagesEl = pagesRef.current;
    const scroller = scrollRef.current;

    setRendering(true);
    setRenderError(null);
    try {
      const doc = await ensurePdfDoc();
      if (!doc) throw new Error("PDF not available");

      const wrapW = pagesEl.clientWidth;
      lastWRef.current = wrapW;
      pagesEl.innerHTML = "";

      const MIN_ZOOM = 0.5, MAX_ZOOM = 3;
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const base = page.getViewport({ scale: 1 });
        const baseFit = wrapW / base.width;
        const scale = fitMode === "fit-width"
          ? Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, baseFit * zoom))
          : Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));

        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = "100%";
        canvas.style.height = "auto";
        canvas.style.display = "block";

        if (ctx) await page.render({ canvasContext: ctx, viewport }).promise;
        pagesEl.appendChild(canvas);
      }
      scroller.scrollTop = 0;
    } catch (e) {
      setRenderError((e as Error).message);
    } finally {
      setRendering(false);
    }
  }, [ensurePdfDoc, fitMode, zoom]);

  function openReader() {
    if (own.kind !== "owner") return;
    setShowReader(true);
    queueMicrotask(async () => {
      readerWrapRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      if (pdfReady) await renderPdf();
    });
  }

  useEffect(() => {
    if (showReader && pdfReady && ebook?.id) void renderPdf();
  }, [showReader, pdfReady, ebook?.id, renderPdf]);

  // UI (unchanged)
  if (err) {
    return (
      <main className="mx-auto max-w-screen-xl px-4 sm:px-6 lg:px-8 py-6">
        <h1 className="text-xl font-bold">E-Book</h1>
        <p className="mt-2 text-red-600 text-sm">Error: {err}</p>
        <Link href="/ebooks" className="mt-3 inline-block underline">Back to E-Books</Link>
      </main>
    );
  }

  if (!ebook) {
    return (
      <main className="mx-auto max-w-screen-xl px-4 sm:px-6 lg:px-8 py-6">
        <div className="rounded-2xl bg-white border border-light p-6 animate-pulse h-[320px]" />
      </main>
    );
  }

  return (
    <main
      className="mx-auto max-w-screen-xl px-4 sm:px-6 lg:px-8 py-6 select-none"
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onDragStart={(e) => { e.preventDefault(); }}
    >
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* LEFT */}
        <aside className="md:col-span-4">
          <div className="md:sticky md:top-20 space-y-4">
            <div className="rounded-2xl bg-white border border-light overflow-hidden">
              {ebook.cover_url ? (
                <Image
                  src={ebook.cover_url}
                  alt={ebook.title}
                  width={1200}
                  height={900}
                  className="w-full h-auto pointer-events-none select-none"
                  priority
                  draggable={false}
                />
              ) : (
                <div className="w-full h-[240px] bg-[color:var(--color-light)]/40 grid place-items-center text-muted">
                  No cover
                </div>
              )}
            </div>

            <div className="rounded-2xl bg-white border border-light p-4">
              <h1 className="text-xl sm:text-2xl font-bold">{ebook.title}</h1>
              <div className="mt-2 text-xs text-muted">Price</div>
              <div className="text-lg font-semibold">{price}</div>

              <div className="mt-3 grid gap-2">
                {own.kind === "loading" && (<div className="text-sm text-muted">Checking access…</div>)}

                {verifying && (
                  <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
                    Verifying payment (ref: {verifying})… You’ll be unlocked automatically once confirmed.
                  </div>
                )}

                {own.kind === "signed_out" && (
                  <>
                    <button
                      onClick={() => router.push(`/auth/sign-in?redirect=${encodeURIComponent(`/ebooks/${slug}`)}`)}
                      className="rounded-lg bg-brand text-white px-5 py-3 font-semibold hover:opacity-90 w-full sm:w-auto"
                    >
                      Sign in to buy
                    </button>
                    <Link
                      href="/dashboard"
                      className="inline-flex items-center justify-center rounded-lg px-5 py-3 ring-1 ring-[var(--color-light)] hover:bg-[color:var(--color-light)]/50 w-full sm:w-auto"
                    >
                      Go to Dashboard
                    </Link>
                  </>
                )}

                {own.kind === "not_owner" && (
                  <>
                    <button
                      onClick={handleBuy}
                      disabled={buying}
                      className="rounded-lg bg-brand text-white px-5 py-3 font-semibold hover:opacity-90 disabled:opacity-60 w-full sm:w-auto"
                    >
                      {buying ? "Redirecting…" : `Buy • ${price}`}
                    </button>
                    <Link
                      href="/dashboard"
                      className="inline-flex items-center justify-center rounded-lg px-5 py-3 ring-1 ring-[var(--color-light)] hover:bg-[color:var(--color-light)]/50 w-full sm:w-auto"
                    >
                      Go to Dashboard
                    </Link>
                  </>
                )}

                {own.kind === "owner" && (
                  <>
                    <button
                      onClick={openReader}
                      className="rounded-lg bg-brand text-white px-5 py-3 font-semibold hover:opacity-90 w-full sm:w-auto"
                    >
                      Read now
                    </button>
                    <Link
                      href="/dashboard"
                      className="inline-flex items-center justify-center rounded-lg px-5 py-3 ring-1 ring-[var(--color-light)] hover:bg-[color:var(--color-light)]/50 w-full sm:w-auto"
                    >
                      Go to Dashboard
                    </Link>
                  </>
                )}
              </div>

              {own.kind !== "owner" && (
                <p className="mt-2 text-[11px] text-muted">Purchase to unlock reading.</p>
              )}
            </div>
          </div>
        </aside>

        {/* RIGHT: secure reader */}
        <section className="md:col-span-8">
          <div ref={readerWrapRef} className="rounded-2xl bg-white border border-light">
            {own.kind !== "owner" ? (
              <div className="w-full h-[70vh] md:h-[80vh] grid place-items-center bg-[color:var(--color-light)]/40 px-6 text-center">
                <div>
                  <div className="text-lg font-semibold">Access locked</div>
                  <p className="text-sm text-muted mt-1">
                    {own.kind === "signed_out"
                      ? "Sign in and purchase to read the full e-book."
                      : "Purchase to read the full e-book."}
                  </p>
                </div>
              </div>
            ) : (
              <div className="relative">
                {/* Toolbar */}
                <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-light bg-white/90 px-3 py-2">
                  <button onClick={() => { setFitMode("fit-width"); setZoom((z) => Math.max(MIN_ZOOM, Math.round((z - 0.1) * 10) / 10)); }} className="rounded-md px-3 py-1 ring-1 ring-[var(--color-light)]">−</button>
                  <button onClick={() => { setFitMode("fit-width"); setZoom((z) => Math.min(MAX_ZOOM, Math.round((z + 0.1) * 10) / 10)); }} className="rounded-md px-3 py-1 ring-1 ring-[var(--color-light)]">+</button>
                  <button onClick={() => { setFitMode("fit-width"); setZoom(1); }} className="rounded-md px-3 py-1 ring-1 ring-[var(--color-light)]">Fit width</button>
                  <button onClick={() => { setFitMode("fixed"); setZoom(1); }} className="rounded-md px-3 py-1 ring-1 ring-[var(--color-light)]">100%</button>
                </div>

                {/* Scrollable frame */}
                <div ref={scrollRef} className="relative z-0 h-[70vh] md:h-[80vh] overflow-auto px-2 py-4">
                  <div ref={pagesRef} aria-label="Secure PDF Reader" className="w-full" />
                  {rendering && (
                    <div className="absolute inset-0 grid place-items-center bg-white/40">
                      <div className="text-sm">Loading pages…</div>
                    </div>
                  )}
                  {renderError && (
                    <div className="p-4 text-sm text-red-600">Error: {renderError}</div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ABOUT */}
          <div className="mt-6 rounded-2xl bg-white border border-light p-4">
            <h2 className="text-lg font-semibold">About this e-book</h2>
            <p className="mt-2 text-sm text-muted whitespace-pre-line">{ebook.description ?? "No description provided."}</p>
            <div className="mt-4">
              <Link href="/ebooks" className="underline">← Back to E-Books</Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
