// lib/stock.ts
import type { SupabaseClient } from "@supabase/supabase-js";

async function readStock(admin: SupabaseClient, ebookId: string): Promise<number | null> {
  const { data } = await admin
    .from("ebooks")
    .select("stock_quantity")
    .eq("id", ebookId)
    .maybeSingle();
  const v = (data as { stock_quantity?: number | null } | null)?.stock_quantity;
  return typeof v === "number" ? v : null;
}

/**
 * Atomically reserve `qty` units. Prefers the decrement_ebook_stock RPC
 * (relative + guarded), falling back to a guarded optimistic loop.
 * Returns true if reserved, false if there was not enough stock.
 * If stock is not tracked (column absent) it returns true (no enforcement).
 */
export async function decrementStock(
  admin: SupabaseClient,
  ebookId: string,
  qty: number,
): Promise<boolean> {
  try {
    const { data, error } = await admin.rpc("decrement_ebook_stock", {
      p_ebook_id: ebookId,
      p_qty: qty,
    });
    if (!error) return data != null; // RPC returns remaining stock, null when insufficient
  } catch {
    // RPC missing — fall through.
  }
  for (let i = 0; i < 5; i++) {
    const cur = await readStock(admin, ebookId);
    if (cur == null) return true; // not tracked → no enforcement
    if (cur < qty) return false;
    const { data } = await admin
      .from("ebooks")
      .update({ stock_quantity: cur - qty })
      .eq("id", ebookId)
      .eq("stock_quantity", cur)
      .select("id")
      .maybeSingle();
    if (data) return true; // won the optimistic race
  }
  return false;
}

/**
 * Relatively restore (return) `qty` units to stock. Always relative to the
 * live value, so it composes correctly with concurrent decrements.
 * No-op when stock is not tracked.
 */
export async function incrementStock(
  admin: SupabaseClient,
  ebookId: string,
  qty: number,
): Promise<void> {
  try {
    const { error } = await admin.rpc("increment_ebook_stock", {
      p_ebook_id: ebookId,
      p_qty: qty,
    });
    if (!error) return; // atomic path
  } catch {
    // RPC missing — fall through to the guarded loop.
  }
  for (let i = 0; i < 6; i++) {
    const cur = await readStock(admin, ebookId);
    if (cur == null) return; // not tracked
    const { data } = await admin
      .from("ebooks")
      .update({ stock_quantity: cur + qty })
      .eq("id", ebookId)
      .eq("stock_quantity", cur)
      .select("id")
      .maybeSingle();
    if (data) return;
  }
}
