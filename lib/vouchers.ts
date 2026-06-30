// lib/vouchers.ts
import type { SupabaseClient } from "@supabase/supabase-js";

export type VoucherRow = {
  id: string;
  code: string;
  discount_type: "percent" | "fixed";
  discount_value: number;
  active: boolean;
  max_uses: number | null;
  used_count: number;
  min_subtotal_cents: number;
  expires_at: string | null;
};

export type VoucherValidation =
  | {
      ok: true;
      voucher: VoucherRow;
      discountCents: number;
      label: string;
    }
  | {
      ok: false;
      error: string;
    };

/** Normalise a voucher code for storage / lookup (upper-case, trimmed). */
export function normalizeVoucherCode(code: string): string {
  return code.trim().toUpperCase();
}

/** Compute the discount (in minor units) a voucher grants for a given subtotal. */
export function computeDiscountCents(
  voucher: Pick<VoucherRow, "discount_type" | "discount_value">,
  subtotalCents: number,
): number {
  const sub = Math.max(0, Math.round(subtotalCents));
  if (voucher.discount_type === "percent") {
    const pct = Math.min(100, Math.max(0, voucher.discount_value));
    return Math.min(sub, Math.round((sub * pct) / 100));
  }
  // fixed amount (minor units)
  return Math.min(sub, Math.max(0, Math.round(voucher.discount_value)));
}

function discountLabel(
  voucher: Pick<VoucherRow, "discount_type" | "discount_value">,
): string {
  if (voucher.discount_type === "percent") return `${voucher.discount_value}% off`;
  return `GH₵ ${(voucher.discount_value / 100).toFixed(2)} off`;
}

/**
 * Look up a voucher by code and validate it against the given subtotal.
 * Pure read — does NOT consume a use. Resilient to a missing `vouchers` table.
 */
export async function validateVoucher(
  admin: SupabaseClient,
  rawCode: string,
  subtotalCents: number,
): Promise<VoucherValidation> {
  const code = normalizeVoucherCode(rawCode || "");
  if (!code) return { ok: false, error: "Enter a voucher code." };

  let row: VoucherRow | null = null;
  try {
    const { data, error } = await admin
      .from("vouchers")
      .select(
        "id, code, discount_type, discount_value, active, max_uses, used_count, min_subtotal_cents, expires_at",
      )
      .eq("code", code)
      .maybeSingle();
    if (error) {
      // Table not set up yet, or transient — treat as no such code.
      return { ok: false, error: "Invalid voucher code." };
    }
    row = (data as VoucherRow | null) ?? null;
  } catch {
    return { ok: false, error: "Invalid voucher code." };
  }

  if (!row) return { ok: false, error: "Invalid voucher code." };
  if (!row.active) return { ok: false, error: "This voucher is no longer active." };
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
    return { ok: false, error: "This voucher has expired." };
  }
  if (row.max_uses != null && row.used_count >= row.max_uses) {
    return { ok: false, error: "This voucher has reached its usage limit." };
  }
  if (subtotalCents < (row.min_subtotal_cents ?? 0)) {
    return {
      ok: false,
      error: `This voucher requires a minimum order of GH₵ ${(
        (row.min_subtotal_cents ?? 0) / 100
      ).toFixed(2)}.`,
    };
  }

  const discountCents = computeDiscountCents(row, subtotalCents);
  if (discountCents <= 0) {
    return { ok: false, error: "This voucher does not apply to this order." };
  }

  return { ok: true, voucher: row, discountCents, label: discountLabel(row) };
}

/**
 * Atomically consume one use of a voucher (respects active / expiry / max_uses).
 * Prefers the `redeem_voucher` RPC; falls back to an optimistic update.
 * Returns true when a use was consumed.
 */
export async function redeemVoucher(
  admin: SupabaseClient,
  rawCode: string,
): Promise<boolean> {
  const code = normalizeVoucherCode(rawCode || "");
  if (!code) return false;

  try {
    const { data, error } = await admin.rpc("redeem_voucher", { p_code: code });
    if (!error && typeof data === "boolean") return data;
  } catch {
    // RPC not installed — fall through to manual path.
  }

  // Fallback: optimistic increment guarded by current used_count.
  try {
    const { data: row } = await admin
      .from("vouchers")
      .select("id, used_count, max_uses, active, expires_at")
      .eq("code", code)
      .maybeSingle();
    if (!row) return false;
    const r = row as {
      id: string;
      used_count: number;
      max_uses: number | null;
      active: boolean;
      expires_at: string | null;
    };
    if (!r.active) return false;
    if (r.expires_at && new Date(r.expires_at).getTime() <= Date.now()) return false;
    if (r.max_uses != null && r.used_count >= r.max_uses) return false;
    const { data: updated } = await admin
      .from("vouchers")
      .update({ used_count: r.used_count + 1, updated_at: new Date().toISOString() })
      .eq("id", r.id)
      .eq("used_count", r.used_count)
      .select("id")
      .maybeSingle();
    return Boolean(updated);
  } catch {
    return false;
  }
}
