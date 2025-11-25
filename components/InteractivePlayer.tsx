"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  src: string;
  title?: string;
  className?: string;
};

/**
 * Wraps an iframe with a tap-to-start overlay so Storyline content
 * gets an initial user gesture for autoplay.
 */
export default function InteractivePlayer({ src, title = "Interactive course player", className = "" }: Props) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [needsTap, setNeedsTap] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setNeedsTap((prev) => prev), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const handleTap = () => {
    setNeedsTap(false);
    try {
      iframeRef.current?.focus();
      iframeRef.current?.contentWindow?.postMessage({ type: "kds-interactive-start" }, "*");
    } catch {
      /* noop */
    }
  };

  return (
    <div className={`relative w-full overflow-hidden rounded-lg border border-light bg-black aspect-[16/9] ${className}`}>
      <iframe
        ref={iframeRef}
        src={src}
        title={title}
        allow="autoplay; fullscreen"
        className="absolute inset-0 h-full w-full"
      />
      {needsTap && (
        <button
          type="button"
          onClick={handleTap}
          className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 text-white text-sm md:text-base font-semibold"
        >
          Tap to start the interactive course
        </button>
      )}
    </div>
  );
}
