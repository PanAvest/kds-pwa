"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams, useParams } from "next/navigation";
import * as pdfjs from "pdfjs-dist";
import NoInternet, { useOfflineMonitor } from "@/components/NoInternet";
import { isIOSApp } from "@/lib/platform";
import { supabase } from "@/lib/supabaseClient";

/** ── Minimal PDF.js typings ──────────────────────────────────────── */
type PdfHttpHeaders = Record<string, string>;
interface PdfLoadingTask<TDoc> { promise: Promise<TDoc>; }
interface PdfJsAPI<TDoc> {
  getDocument: (params: {
    data?: ArrayBuffer | Uint8Array;
    url?: string;
    withCredentials?: boolean;
    httpHeaders?: PdfHttpHeaders;
  }) => PdfLoadingTask<TDoc>;
  GlobalWorkerOptions: { workerSrc: string };
}
type PdfPage = {
  getViewport: (opts: { scale: number }) => { width: number; height: number };
  render: (opts: {
    canvasContext: CanvasRenderingContext2D;
    viewport: { width: number; height: number };
  }) => { promise: Promise<void> };
};
type PdfDoc = { numPages: number; getPage(n: number): Promise<PdfPage> };
/** ───────────────────────────────────────────────────────────────── */

type Ebook = {
  id: string;
  slug: string;
  title: string;
  description?: string | null;
  cover_url?: string | null;
  sample_url?: string | null;
  price_cents: number | string | null;
  published: boolean;
};

type OwnershipState =
  | { kind: "loading" }
  | { kind: "signed_out" }
  | { kind: "owner" }
  | { kind: "not_owner" };

type FitMode = "fit-width" | "fixed";

export default function EbookDetailPage() {
  const router = useRouter();
  const search = useSearchParams();
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";
  const isIOS = useMemo(() => isIOSApp(), []);
  const { isOffline, markOffline, markOnline } = useOfflineMonitor();

  const [ebook, setEbook] = useState<Ebook | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [own, setOwn] = useState<OwnershipState>({ kind: "loading" });
  const [userId, setUserId] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [buying, setBuying] = useState(false);
  const [verifying, setVerifying] = useState<string | null>(null);

  // Reader state
  const [pdfReady, setPdfReady] = useState(false);
  const [showReader, setShowReader] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);

  // Zoom and layout
  const [fitMode, setFitMode] = useState<FitMode>("fit-width");
  const [zoom, setZoom] = useState<number>(1);
  const MIN_ZOOM = 0.5;
  const MAX_ZOOM = 3;

  // Refs
  const readerWrapRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pagesRef = useRef<HTMLDivElement | null>(null);
  const pdfDocRef = useRef<PdfDoc | null>(null);
  const lastContainerWidthRef = useRef<number>(0);

  const dashboardHref = "/dashboard";
  const flagOfflineFromError = useCallback((err: unknown) => {
    const msg = (err as any)?.message;
    if (!msg || typeof msg !== "string") return;
    const lower = msg.toLowerCase();
    if (lower.includes("network") || lower.includes("fetch") || lower.includes("offline")) {
      markOffline();
    }
  }, [markOffline]);

  /** Block basic copying/printing (best-effort) */
  useEffect(() => {
    const preventAll = (e: Event) => { e.preventDefault(); e.stopPropagation(); };
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && ["p","s","u","c","x","a"].includes(k)) preventAll(e);
    };
    const CAPTURE: AddEventListenerOptions = { capture: true };
    document.addEventListener("contextmenu", preventAll, CAPTURE);
    document.addEventListener("copy", preventAll, CAPTURE);
    document.addEventListener("cut", preventAll, CAPTURE);
    document.addEventListener("paste", preventAll, CAPTURE);
    document.addEventListener("keydown", onKey, CAPTURE);
    window.addEventListener("beforeprint", preventAll, CAPTURE);
    return () => {
      document.removeEventListener("contextmenu", preventAll, CAPTURE);
      document.removeEventListener("copy", preventAll, CAPTURE);
      document.removeEventListener("cut", preventAll, CAPTURE);
      document.removeEventListener("paste", preventAll, CAPTURE);
      document.removeEventListener("keydown", onKey, CAPTURE);
      window.removeEventListener("beforeprint", preventAll, CAPTURE);
    };
  }, []);

  /** PDF worker */
  useEffect(() => {
    try {
      (pdfjs as unknown as PdfJsAPI<PdfDoc>).GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.min.mjs";
      setPdfReady(true);
    } catch {
      setPdfReady(false);
    }
  }, []);

  /** Auth (view page ok; login required to buy/read) */
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setUserId(""); setEmail(""); setOwn({ kind: "signed_out" });
        return;
      }
      setUserId(user.id);
      setEmail(user.email ?? "");
    })();
  }, []);

  /** Load ebook meta */
  useEffect(() => {
    if (!slug) return;
    (async () => {
      try {
        const r = await fetch(`/api/ebooks/${encodeURIComponent(slug)}`, { cache: "no-store" });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || r.statusText);
        const raw = (j && typeof j === "object" && "ebook" in j) ? (j as any).ebook : j;
        setEbook(raw as Ebook);
        markOnline();
      } catch (e) {
        setErr((e as Error).message);
        markOffline();
      }
    })();
  }, [slug, markOffline, markOnline]);

  /** Ownership check */
  useEffect(() => {
    (async () => {
      if (!ebook?.id) { setOwn({ kind: "loading" }); return; }
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setOwn({ kind: "signed_out" }); return; }
        const { data, error } = await supabase
          .from("ebook_purchases")
          .select("status")
          .eq("user_id", user.id)
          .eq("ebook_id", ebook.id)
          .maybeSingle();
        if (error) { setOwn({ kind: "not_owner" }); flagOfflineFromError(error); return; }
        setOwn(data?.status === "paid" ? { kind: "owner" } : { kind: "not_owner" });
      } catch (e) {
        setOwn({ kind: "not_owner" });
        flagOfflineFromError(e);
      }
    })();
  }, [ebook?.id, flagOfflineFromError]);

  /** Handle Paystack return (?reference=...) + polling */
  useEffect(() => {
    const ref = search.get("reference") || search.get("trxref") || search.get("ref") || null;
    if (!ref || !ebook?.id || !userId) return;

    let stopped = false;
    let tries = 0;
    setVerifying(ref);

    (async () => {
      try {
        await fetch(`/api/payments/paystack/verify?reference=${encodeURIComponent(ref)}`, { method: "GET" })
          .then((r) => r.json())
          .catch((err) => { flagOfflineFromError(err); return null; });
      } catch (err) { flagOfflineFromError(err); }

      while (!stopped && tries < 15) {
        tries += 1;
        try {
          const { data, error } = await supabase
            .from("ebook_purchases")
            .select("status")
            .eq("user_id", userId)
            .eq("ebook_id", ebook.id)
            .maybeSingle();
          const paid = !error && data?.status === "paid";
          if (paid) {
            setOwn({ kind: "owner" });
            setVerifying(null);
            router.replace(`/ebooks/${encodeURIComponent(slug)}`);
            return;
          }
          if (error) flagOfflineFromError(error);
        } catch (err) { flagOfflineFromError(err); }
        await new Promise((r) => setTimeout(r, 2000));
      }
      setVerifying(null);
    })();

    return () => { stopped = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, ebook?.id, userId, slug]);

  /** Price label (safe number parsing) */
  const price = useMemo(() => {
    if (!ebook) return "";
    const numeric = typeof ebook.price_cents === "number" ? ebook.price_cents : Number(ebook.price_cents ?? 0);
    if (!Number.isFinite(numeric)) return "GH₵ 0.00";
    return `GH₵ ${(numeric / 100).toFixed(2)}`;
  }, [ebook]);
  const iosAccessRequired = (
    <div className="space-y-2 text-sm text-muted">
      <div className="text-base font-semibold text-ink">Access Required</div>
      <p>
        This mobile app allows you to sign in and use any books or knowledge materials that are already part of your KDS Learning account.
      </p>
      <p>
        To unlock this item, please ensure it has been added to your account on the KDS Learning website: www.panavestkds.com.
      </p>
      <p>
        If it is already available on your account, simply sign in with the same details here and it will appear automatically.
      </p>
    </div>
  );
  const iosHasAccess = (
    <div className="text-sm text-muted">
      You already have access to this material. Tap below to open it.
    </div>
  );

  /** Start Paystack */
  async function handleBuy() {
    if (isIOS) {
      setErr("Access Required");
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push(`/auth/sign-in?redirect=${encodeURIComponent(`/ebooks/${slug}`)}`); return; }
    if (!ebook || !email) return;

    setBuying(true);
    try {
      const numeric = typeof ebook.price_cents === "number" ? ebook.price_cents : Number(ebook.price_cents ?? 0);
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
      // Use replace to avoid opening a new tab and return back into the app domain
      window.location.replace(data.authorization_url as string);
    } catch (e) {
      setErr((e as Error).message || "Payment init failed");
      flagOfflineFromError(e);
    } finally {
      setBuying(false);
    }
  }

  /** Load PDF bytes via secure route with bearer token, mirroring main app */
  const ensurePdfDoc = useCallback(async (): Promise<PdfDoc | null> => {
    if (pdfDocRef.current) return pdfDocRef.current;
    if (!ebook?.id) return null;
    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token;
    if (!accessToken) { setRenderError("You must be signed in to read this e-book."); return null; }

    let res: Response;
    try {
      res = await fetch(`/api/ebooks/secure-pdf?ebookId=${encodeURIComponent(ebook.id)}`, {
        credentials: "include", cache: "no-store",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    } catch (err) {
      flagOfflineFromError(err);
      setRenderError("Secure PDF request failed. Check your connection.");
      return null;
    }

    if (res.status === 401) {
      setRenderError("Session expired or not signed in. Please sign in again.");
      router.push(`/auth/sign-in?redirect=${encodeURIComponent(`/ebooks/${slug}`)}`);
      return null;
    }
    if (res.status === 403) { setRenderError("You haven’t purchased this e-book for this account."); return null; }
    if (res.status === 404) { setRenderError("File not available for this e-book."); return null; }
    if (!res.ok) { setRenderError(`Secure PDF request failed: ${res.status}`); return null; }

    const buf = await res.arrayBuffer();
    const pdfApi = pdfjs as unknown as PdfJsAPI<PdfDoc>;
    const loadingTask = pdfApi.getDocument({ data: buf });
    const doc = await loadingTask.promise;
    pdfDocRef.current = doc;
    return doc;
  }, [ebook?.id, flagOfflineFromError, router, slug]);

  /** Core renderer with correct scaling and scroll behavior */
  const renderPdf = useCallback(async () => {
    if (!pagesRef.current || !scrollRef.current) return;
    const pagesEl = pagesRef.current;
    const scroller = scrollRef.current;

    setRendering(true);
    setRenderError(null);
    try {
      const doc = await ensurePdfDoc();
      if (!doc) throw new Error("PDF not available");

      const containerWidth = pagesEl.clientWidth;
      lastContainerWidthRef.current = containerWidth;
      pagesEl.innerHTML = "";

      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const base = page.getViewport({ scale: 1 });
        const baseFitScale = containerWidth / base.width;
        const scale =
          fitMode === "fit-width"
            ? Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, baseFitScale * zoom))
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
      setRenderError((e as Error).message || "Failed to load PDF");
      flagOfflineFromError(e);
    } finally {
      setRendering(false);
    }
  }, [ensurePdfDoc, fitMode, zoom, flagOfflineFromError]);

  /** Open reader and render */
  function openReader() {
    if (own.kind !== "owner") return;
    setShowReader(true);
    queueMicrotask(async () => {
      readerWrapRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      if (pdfReady) await renderPdf();
    });
  }

  /** Re-render on zoom or mode change */
  useEffect(() => {
    if (showReader && pdfReady && ebook?.id) void renderPdf();
  }, [showReader, pdfReady, ebook?.id, renderPdf]);

  /** Resize handling with ResizeObserver for snappy fit-width reflow */
  useEffect(() => {
    if (!pagesRef.current) return;
    const target = pagesRef.current.parentElement;
    if (!target) return;

    const ro = new ResizeObserver(() => {
      if (!showReader || !pdfReady || !ebook?.id) return;
      const w = pagesRef.current?.clientWidth || 0;
      if (w && w !== lastContainerWidthRef.current) {
        lastContainerWidthRef.current = w;
        void renderPdf();
      }
    });
    ro.observe(target);
    return () => ro.disconnect();
  }, [showReader, pdfReady, ebook?.id, renderPdf]);

  /** Keyboard zoom shortcuts */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!showReader) return;
      if ((e.ctrlKey || e.metaKey) && (e.key === "+" || e.key === "=")) {
        e.preventDefault();
        setFitMode("fit-width");
        setZoom((z) => Math.min(MAX_ZOOM, Math.round((z + 0.1) * 10) / 10));
      } else if ((e.ctrlKey || e.metaKey) && e.key === "-") {
        e.preventDefault();
        setFitMode("fit-width");
        setZoom((z) => Math.max(MIN_ZOOM, Math.round((z - 0.1) * 10) / 10));
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showReader]);

  /** UI */
  if (isOffline) {
    return <NoInternet forceOffline />;
  }

  if (err) {
    return (
      <main className="mx-auto max-w-screen-xl px-4 sm:px-6 lg:px-8 py-10">
        <h1 className="text-2xl font-bold">E-Book</h1>
        <p className="mt-3 text-red-600 text-sm">Error: {err}</p>
        <Link href="/ebooks" className="mt-4 inline-block underline">Back to E-Books</Link>
      </main>
    );
  }

  if (!ebook) {
    return (
      <main className="mx-auto max-w-screen-xl px-4 sm:px-6 lg:px-8 py-10">
        <div className="rounded-2xl bg-white border border-light p-6 animate-pulse h-[320px]" />
      </main>
    );
  }

  return (
    <main
      className="mx-auto max-w-screen-xl px-4 sm:px-6 lg:px-8 py-10 select-none"
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onDragStart={(e) => { e.preventDefault(); }}
    >
      <style jsx global>{`
        @media print { body { display: none !important; } }
        html, body, main, .secure-viewer, .secure-viewer * { user-select: none !important; }
      `}</style>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
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
                <div className="w-full h-[260px] bg-[color:var(--color-light)]/40 flex items-center justify-center text-muted">
                  No cover
                </div>
              )}
            </div>

            <div className="rounded-2xl bg-white border border-light p-4">
              <h1 className="text-2xl font-bold">{ebook.title}</h1>
              <div className="mt-2 text-sm text-muted">Price</div>
              <div className="text-xl font-semibold">{price}</div>
              {isIOS && own.kind !== "owner" && (
                <div className="mt-2 rounded-md bg-[color:var(--color-light)]/60 text-xs text-muted px-3 py-2 space-y-1">
                  {iosAccessRequired}
                </div>
              )}

              <div className="mt-4 grid gap-3">
                {own.kind === "loading" && (<div className="text-sm text-muted">Checking access…</div>)}

                {verifying && (
                  <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
                    Verifying payment (ref: {verifying})… You’ll be unlocked automatically once confirmed.
                  </div>
                )}

                {own.kind === "signed_out" && (
                  isIOS ? (
                    <>
                      {iosAccessRequired}
                      <Link
                        href={`/auth/sign-in?redirect=${encodeURIComponent(`/ebooks/${slug}`)}`}
                        className="inline-flex items-center justify-center rounded-lg bg-brand text-white px-5 py-3 font-semibold hover:opacity-90 w-full sm:w-auto"
                      >
                        Sign in to access
                      </Link>
                    </>
                  ) : (
                    <>
                      <Link
                        href={`/auth/sign-in?redirect=${encodeURIComponent(`/ebooks/${slug}`)}`}
                        className="inline-flex items-center justify-center rounded-lg bg-brand text-white px-5 py-3 font-semibold hover:opacity-90 w-full sm:w-auto"
                      >
                        Sign in to buy
                      </Link>
                      <Link
                        href={dashboardHref}
                        className="inline-flex items-center justify-center rounded-lg px-5 py-3 ring-1 ring-[var(--color-light)] hover:bg-[color:var(--color-light)]/50 w-full sm:w-auto"
                      >
                        Go to Dashboard
                      </Link>
                    </>
                  )
                )}

                {own.kind === "not_owner" && (
                  isIOS ? (
                    <>
                      <div className="rounded-md bg-[color:var(--color-light)]/60 px-4 py-3 text-sm text-muted space-y-1">
                        {iosAccessRequired}
                      </div>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={handleBuy}
                        disabled={buying}
                        className="rounded-lg text-white px-5 py-3 font-semibold hover:opacity-90 disabled:opacity-60 w-full sm:w-auto"
                        style={{ backgroundColor: "var(--color-accent-red)" }}
                      >
                        {buying ? "Redirecting…" : `Buy • ${price}`}
                      </button>
                      <Link
                        href={dashboardHref}
                        className="inline-flex items-center justify-center rounded-lg px-5 py-3 ring-1 ring-[var(--color-light)] hover:bg-[color:var(--color-light)]/50 w-full sm:w-auto"
                      >
                        Go to Dashboard
                      </Link>
                    </>
                  )
                )}

                {own.kind === "owner" && (
                  <>
                    {isIOS && iosHasAccess}
                    <button
                      onClick={openReader}
                      className="rounded-lg text-white px-5 py-3 font-semibold hover:opacity-90 w-full sm:w-auto"
                      style={{ backgroundColor: "var(--color-accent-red)" }}
                    >
                      Read now
                    </button>
                    <Link
                      href={dashboardHref}
                      className="inline-flex items-center justify-center rounded-lg px-5 py-3 ring-1 ring-[var(--color-light)] hover:bg-[color:var(--color-light)]/50 w-full sm:w-auto"
                    >
                      Go to Dashboard
                    </Link>
                  </>
                )}
              </div>

              {own.kind !== "owner" && (
                <p className="mt-3 text-xs text-muted">
                  {isIOS
                    ? "If it is already on your KDS Learning account, sign in with the same details to read."
                    : "Sign in and purchase to unlock reading."}
                </p>
              )}
            </div>
          </div>
        </aside>

        {/* RIGHT: secure reader */}
        <section className="md:col-span-8">
          <div ref={readerWrapRef} className="rounded-2xl bg-white border border-light secure-viewer">
            {own.kind !== "owner" ? (
              <div className="w-full h-[70vh] md:h-[80vh] grid place-items-center bg-[color:var(--color-light)]/40">
                <div className="text-center px-6">
                  <div className="text-lg font-semibold">Access locked</div>
                  <p className="text-sm text-muted mt-1">
                    {isIOS
                      ? "Access Required — make sure this e-book is on your KDS Learning account at www.panavestkds.com. If it already is, sign in here with the same details to open it."
                      : own.kind === "signed_out"
                        ? "Sign in and purchase to read the full e-book."
                        : "Purchase to read the full e-book."}
                  </p>
                </div>
              </div>
            ) : (
              <div className="relative">
                {/* Toolbar */}
                <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-light bg-white/90 px-3 py-2">
                  <button
                    onClick={() => { setFitMode("fit-width"); setZoom((z) => Math.max(MIN_ZOOM, Math.round((z - 0.1) * 10) / 10)); }}
                    className="rounded-md px-3 py-1 ring-1 ring-[var(--color-light)] hover:bg-[color:var(--color-light)]/50"
                    aria-label="Zoom out"
                  >
                    −
                  </button>
                  <button
                    onClick={() => { setFitMode("fit-width"); setZoom((z) => Math.min(MAX_ZOOM, Math.round((z + 0.1) * 10) / 10)); }}
                    className="rounded-md px-3 py-1 ring-1 ring-[var(--color-light)] hover:bg-[color:var(--color-light)]/50"
                    aria-label="Zoom in"
                  >
                    +
                  </button>
                  <button
                    onClick={() => { setFitMode("fit-width"); setZoom(1); }}
                    className="rounded-md px-3 py-1 ring-1 ring-[var(--color-light)] hover:bg-[color:var(--color-light)]/50"
                    aria-label="Fit width"
                  >
                    Fit width
                  </button>
                  <button
                    onClick={() => { setFitMode("fixed"); setZoom(1.0); }}
                    className="rounded-md px-3 py-1 ring-1 ring-[var(--color-light)] hover:bg-[color:var(--color-light)]/50"
                    aria-label="100 percent"
                  >
                    100%
                  </button>
                  <span className="ml-2 text-sm text-muted">Mode: {fitMode === "fit-width" ? "Fit width" : "Fixed"} · Zoom: {(zoom * 100).toFixed(0)}%</span>
                  <div className="ml-auto flex gap-2">
                    <button
                      onClick={() => { const s = scrollRef.current; if (s) s.scrollTo({ top: 0, behavior: "smooth" }); }}
                      className="rounded-md px-3 py-1 ring-1 ring-[var(--color-light)] hover:bg-[color:var(--color-light)]/50"
                      aria-label="Scroll to top"
                    >
                      Top
                    </button>
                    <button
                      onClick={() => { const s = scrollRef.current; if (s) s.scrollTo({ top: s.scrollHeight, behavior: "smooth" }); }}
                      className="rounded-md px-3 py-1 ring-1 ring-[var(--color-light)] hover:bg-[color:var(--color-light)]/50"
                      aria-label="Scroll to bottom"
                    >
                      Bottom
                    </button>
                  </div>
                </div>

                {/* Scrollable frame (mobile friendly heights) */}
                <div ref={scrollRef} className="relative z-0 h-[70vh] md:h-[80vh] overflow-auto px-2 py-4">
                  <div ref={pagesRef} aria-label="Secure PDF Reader" className="w-full" />
                  {rendering && (
                    <div className="absolute inset-0 grid place-items-center bg-white/40">
                      <div className="text-sm">Loading pages…</div>
                    </div>
                  )}
                  {renderError && (
                    <div className="p-4 text-sm text-red-600">Error loading PDF: {renderError}</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* DESCRIPTION */}
      <section className="mt-10">
        <div className="rounded-2xl bg-white border border-light p-6">
          <h2 className="text-xl font-semibold">About this e-book</h2>
          <p className="mt-3 text-muted whitespace-pre-line">
            {ebook.description ?? "No description provided."}
          </p>
          <div className="mt-6">
            <Link href="/ebooks" className="underline">← Back to E-Books</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
