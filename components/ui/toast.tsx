"use client";

import { useEffect, useState, Dispatch, SetStateAction } from "react";
import { cn } from "@/utils/cn";

type ToastMsg = { id: number; text: string };

let subscribers: Dispatch<SetStateAction<ToastMsg[]>>[] = [];

export function pushToast(text: string) {
  subscribers.forEach((set) =>
    set((s) => [...s, { id: Date.now() + Math.random(), text }])
  );
}

export function ToastHost() {
  const [items, setItems] = useState<ToastMsg[]>([]);

  useEffect(() => {
    subscribers.push(setItems);
    return () => {
      subscribers = subscribers.filter((s) => s !== setItems);
    };
  }, []);

  return (
    <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 space-y-2">
      {items.map((i) => (
        <div
          key={i.id}
          className={cn(
            "rounded-xl bg-[var(--color-text-dark)] px-4 py-2 text-white shadow"
          )}
        >
          {i.text}
        </div>
      ))}
    </div>
  );
}
