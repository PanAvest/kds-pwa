"use client";
// File: components/ui/sheet.tsx

import * as React from "react";

type SheetProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  children: React.ReactNode;
};

export function Sheet({ open, onOpenChange, children }: SheetProps) {
  // dumb controlled container
  return <div data-sheet-open={open}>{children}</div>;
}

export function SheetTrigger({
  asChild,
  children,
  onClick,
}: {
  asChild?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  );
}

export function SheetContent({
  side = "left",
  children,
}: {
  side?: "left" | "right" | "top" | "bottom";
  children: React.ReactNode;
}) {
  // style this as a sliding panel if you like
  return (
    <div
      role="dialog"
      aria-modal="true"
      data-side={side}
      className="fixed inset-y-0 left-0 w-[85vw] max-w-sm bg-white border-r shadow-xl p-4 md:hidden"
    >
      {children}
    </div>
  );
}

export function SheetHeader({ children }: { children: React.ReactNode }) {
  return <div className="mb-3">{children}</div>;
}

export function SheetTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-base font-semibold">{children}</div>;
}
