// File: components/ProgressBar.tsx
// /components/ProgressBar.tsx
"use client";
import React from "react";

export function ProgressBar({ value = 0 }: { value: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="w-full h-2 rounded-full bg-[color:var(--color-light,#eef0f3)] overflow-hidden">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${pct}%`, background: "#b65437" }}
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      />
    </div>
  );
}
