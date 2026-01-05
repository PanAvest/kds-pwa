"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";

// pdfjs uses Promise.withResolvers in newer builds; polyfill for runtimes that lack it.
if (typeof Promise !== "undefined" && !(Promise as unknown as { withResolvers?: unknown }).withResolvers) {
  (Promise as unknown as { withResolvers?: <T>() => { promise: Promise<T>; resolve: (value: T | PromiseLike<T>) => void; reject: (reason?: unknown) => void } }).withResolvers = function withResolvers<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

type PdfDocument = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPage>;
};

type PdfPage = {
  getViewport: (opts: { scale: number }) => { width: number; height: number };
  render: (opts: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => {
    promise: Promise<unknown>;
    cancel?: () => void;
  };
};

type PdfJsApi = {
  getDocument: (src: string | { url: string }) => { promise: Promise<PdfDocument> };
  GlobalWorkerOptions: { workerSrc?: string };
};

type Props = {
  src: string;
  className?: string;
};

const workerSet = { done: false };
const docCache = new Map<string, Promise<PdfDocument>>();

export default function PdfPageViewer({ src, className }: Props) {
  const fullRef = useRef<HTMLDivElement | null>(null);
  const [page, setPage] = useState(1);
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0);
  const [zoom, setZoom] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderTaskRef = useRef<{ cancel?: () => void } | null>(null);
  const renderIdRef = useRef(0);
  const lastSizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  const resizeFrameRef = useRef<number | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const pinchStartRef = useRef<{ dist: number; zoom: number } | null>(null);

  const pdfApi = pdfjs as unknown as PdfJsApi;

  const ensureWorker = useCallback(() => {
    if (workerSet.done) return;
    try {
      if (!pdfApi.GlobalWorkerOptions.workerSrc) {
        pdfApi.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.min.mjs";
      }
      workerSet.done = true;
    } catch {
      // ignore
    }
  }, [pdfApi]);

  const ensureDoc = useCallback(async () => {
    ensureWorker();
    if (!src) throw new Error("PDF source missing");
    if (!docCache.has(src)) {
      docCache.set(src, pdfApi.getDocument(src).promise);
    }
    return docCache.get(src)!;
  }, [ensureWorker, pdfApi, src]);

  const renderPage = useCallback(async (pageNumber: number) => {
    if (!containerRef.current || !canvasRef.current) return;
    setLoading(true);
    setError(null);
    renderIdRef.current += 1;
    const currentRenderId = renderIdRef.current;

    try {
      const doc = await ensureDoc();
      if (currentRenderId !== renderIdRef.current) return;

      setTotalPages(doc.numPages);
      const safePage = Math.max(1, Math.min(doc.numPages, pageNumber));
      setPage(safePage);

      const pageObj = await doc.getPage(safePage);
      if (currentRenderId !== renderIdRef.current) return;

      const containerWidth = containerRef.current.clientWidth || 1;
      const viewportBase = pageObj.getViewport({ scale: 1 });
      const containerHeight =
        containerRef.current.clientHeight || (typeof window !== "undefined" ? window.innerHeight * 0.72 : viewportBase.height);
      const scale = Math.max(
        0.1,
        Math.min(containerWidth / viewportBase.width, containerHeight / viewportBase.height)
      );
      const viewport = pageObj.getViewport({ scale: scale * zoom, rotation });

      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas unavailable");
      const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2.5) : 1;
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      canvas.style.maxWidth = "100%";
      canvas.style.maxHeight = "100%";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (renderTaskRef.current?.cancel) renderTaskRef.current.cancel();
      const task = pageObj.render({ canvasContext: ctx, viewport });
      renderTaskRef.current = task;
      await task.promise;

      if (currentRenderId !== renderIdRef.current) return;
      setLoading(false);
    } catch (e) {
      if (currentRenderId !== renderIdRef.current) return;
      setError((e as Error).message || "Failed to load PDF");
      setLoading(false);
    }
  }, [ensureDoc, rotation, zoom]);

  useEffect(() => {
    renderIdRef.current += 1;
    setTotalPages(0);
    setLoading(true);
    setError(null);
    setPage(1);
    setZoom(1);
    void renderPage(1);
    return () => {
      renderIdRef.current += 1;
      if (renderTaskRef.current?.cancel) renderTaskRef.current.cancel();
    };
    // We intentionally only depend on src so rotation changes don't reset progress.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  // Re-render current page when rotation changes without resetting progress
  useEffect(() => {
    renderIdRef.current += 1;
    void renderPage(page);
  }, [rotation, page, renderPage]);

  // Re-render when zoom changes
  useEffect(() => {
    renderIdRef.current += 1;
    void renderPage(page);
  }, [zoom, page, renderPage]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    lastSizeRef.current = { w: el.clientWidth, h: el.clientHeight };

    const onResize = () => {
      if (!containerRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      if (Math.abs(w - lastSizeRef.current.w) < 2 && Math.abs(h - lastSizeRef.current.h) < 2) return;
      lastSizeRef.current = { w, h };
      if (resizeFrameRef.current) cancelAnimationFrame(resizeFrameRef.current);
      resizeFrameRef.current = requestAnimationFrame(() => {
        resizeFrameRef.current = null;
        void renderPage(page);
      });
    };

    const ro = new ResizeObserver(onResize);
    ro.observe(el);
    return () => {
      ro.disconnect();
      if (resizeFrameRef.current) cancelAnimationFrame(resizeFrameRef.current);
    };
  }, [page, renderPage]);

  const toggleFullscreen = async () => {
    const node = fullRef.current;
    if (!node) return;
    try {
      if (!document.fullscreenElement) {
        await node.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    const onChange = () => {
      const node = fullRef.current;
      const active = !!node && document.fullscreenElement === node;
      setIsFullscreen(active);
      if (!active) {
        setRotation(0);
        setZoom(1);
      }
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
    };
  }, []);

  const canGoPrev = page > 1;
  const canGoNext = totalPages > 0 && page < totalPages;

  const onPrev = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!canGoPrev) return;
    const nextPage = page - 1;
    renderIdRef.current += 1;
    void renderPage(nextPage);
  };

  const onNext = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!canGoNext) return;
    const nextPage = page + 1;
    renderIdRef.current += 1;
    void renderPage(nextPage);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (e.touches.length === 1) {
      const t = e.touches[0];
      touchStartRef.current = { x: t.clientX, y: t.clientY };
    } else if (e.touches.length === 2 && isFullscreen) {
      const [t1, t2] = e.touches;
      const dx = t1.clientX - t2.clientX;
      const dy = t1.clientY - t2.clientY;
      const dist = Math.hypot(dx, dy);
      pinchStartRef.current = { dist, zoom };
    }
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    e.stopPropagation();
    pinchStartRef.current = null;
    if (!touchStartRef.current) return;
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (e.changedTouches.length !== 1) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    // Swipe down to exit fullscreen
    if (isFullscreen && dy > 80 && Math.abs(dx) < 40) {
      void document.exitFullscreen().catch(() => {});
      return;
    }
    if (Math.abs(dx) < 40 || Math.abs(dy) > 30) return;
    if (dx < 0) onNext(e);
    else onPrev(e);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!isFullscreen) return;
    if (pinchStartRef.current && e.touches.length === 2) {
      e.preventDefault();
      const [t1, t2] = e.touches;
      const dx = t1.clientX - t2.clientX;
      const dy = t1.clientY - t2.clientY;
      const dist = Math.hypot(dx, dy);
      const start = pinchStartRef.current;
      const ratio = dist / Math.max(1, start.dist);
      const nextZoom = Math.min(3, Math.max(0.5, start.zoom * ratio));
      setZoom(nextZoom);
    }
  };

  return (
    <div
      ref={fullRef}
      className={["w-full max-w-full", className ?? ""].join(" ").trim()}
      onClick={(e) => { e.stopPropagation(); }}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      onTouchMove={onTouchMove}
    >
      <div
        ref={containerRef}
        className={`w-full max-w-full overflow-auto rounded-lg border border-[color:var(--color-light)] bg-white flex items-center justify-center ${isFullscreen ? "touch-pan-y" : ""}`}
        style={
          isFullscreen
            ? { minHeight: "100vh", maxHeight: "100vh", width: "100vw", margin: "0 auto", touchAction: "none" }
            : { minHeight: "65vh", maxHeight: "85vh" }
        }
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <canvas ref={canvasRef} className="block" />
      </div>

      <div
        className={`mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between ${
          isFullscreen ? "fixed bottom-3 left-0 right-0 z-30 px-4" : ""
        }`}
        style={isFullscreen ? { pointerEvents: "none" } : undefined}
      >
        <div
          className={`flex items-center gap-2 flex-wrap ${
            isFullscreen ? "mx-auto max-w-screen-sm rounded-xl bg-white/90 px-3 py-2 shadow-lg" : ""
          }`}
          style={isFullscreen ? { pointerEvents: "auto" } : undefined}
        >
          <button
            type="button"
            onClick={onPrev}
            disabled={!canGoPrev}
            className={`min-w-[44px] px-3 py-2 rounded-lg border text-sm ${canGoPrev ? "active:scale-[0.98]" : "opacity-50 cursor-not-allowed"}`}
          >
            Prev page
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={!canGoNext}
            className={`min-w-[44px] px-3 py-2 rounded-lg border text-sm ${canGoNext ? "active:scale-[0.98]" : "opacity-50 cursor-not-allowed"}`}
          >
            Next page
          </button>
          {isFullscreen && (
            <>
              <button
                type="button"
                onClick={() => setRotation((r) => ((r + 270) % 360) as 0 | 90 | 180 | 270)}
                className="min-w-[44px] px-3 py-2 rounded-lg border text-sm active:scale-[0.98]"
              >
                Rotate ⟲
              </button>
              <button
                type="button"
                onClick={() => setRotation((r) => ((r + 90) % 360) as 0 | 90 | 180 | 270)}
                className="min-w-[44px] px-3 py-2 rounded-lg border text-sm active:scale-[0.98]"
              >
                Rotate ⟳
              </button>
              <button
                type="button"
                onClick={() => setRotation(0)}
                className="min-w-[44px] px-3 py-2 rounded-lg border text-sm active:scale-[0.98]"
              >
                Reset
              </button>
            </>
          )}
        </div>
        <div
          className={`flex items-center gap-3 text-xs text-[color:var(--color-text-muted)] ${
            isFullscreen ? "mx-auto max-w-screen-sm rounded-xl bg-white/90 px-3 py-2 shadow-lg" : ""
          }`}
          style={isFullscreen ? { pointerEvents: "auto" } : undefined}
        >
          <span>{loading ? "Loading…" : error ? "Error" : `Page ${page} of ${totalPages || "?"}`}</span>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="rounded-lg border px-3 py-1 text-[11px] sm:text-xs active:scale-[0.98]"
            aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          >
            {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-2 text-xs text-red-700">
          {error}{" "}
          <button
            type="button"
            className="underline"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              renderIdRef.current += 1;
              setError(null);
              setLoading(true);
              void renderPage(page);
            }}
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
