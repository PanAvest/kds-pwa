'use client';

import { cn } from "@/utils/cn";

type TabsProps = {
  tabs: string[];
  value: string;
  onChange: (v: string) => void;
};

export function Tabs({ tabs, value, onChange }: TabsProps) {
  return (
    <div className="w-full">
      <div className="flex gap-2 border-b border-[var(--color-soft)]">
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onChange(t)}
            className={cn(
              "px-3 py-2 text-sm transition-colors",
              value === t
                ? "border-b-2 border-[var(--color-primary)] font-semibold text-[var(--color-primary)]"
                : "text-[var(--color-muted)] hover:text-[var(--color-foreground)]"
            )}
            aria-current={value === t ? "page" : undefined}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}
