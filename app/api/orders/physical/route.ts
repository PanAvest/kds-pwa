// File: app/api/orders/physical/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { validateVoucher, redeemVoucher, normalizeVoucherCode } from "@/lib/vouchers";
import { decrementStock, incrementStock } from "@/lib/stock";
import { sendEmailOnce } from "@/lib/email";
import { physicalOrderInvoiceEmail } from "@/lib/emailTemplates";

type Fulfillment = "delivery" | "pickup";

type EbookRow = {
  id: string;
  slug: string;
  title: string | null;
  price_cents: number | null;
  physical_price_cents?: number | null;
  stock_quantity?: number | null;
};

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function makeOrderRef(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `PHY-${ts}-${rand}`;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const ebookSlug = str(body.ebook_slug);
  const customerName = str(body.customer_name);
  const email = str(body.email);
  const phone = str(body.phone);
  const fulfillment: Fulfillment = body.fulfillment === "pickup" ? "pickup" : "delivery";
  const region = str(body.region);
  const city = str(body.city);
  const street = str(body.street);
  const voucherCode = str(body.voucher_code);
  const notes = str(body.notes);
  const quantityRaw = Number(body.quantity);
  const quantity =
    Number.isFinite(quantityRaw) && quantityRaw >= 1 ? Math.min(999, Math.floor(quantityRaw)) : 0;

  // Validation
  if (!ebookSlug) return NextResponse.json({ error: "Missing book." }, { status: 400 });
  if (!customerName) return NextResponse.json({ error: "Name is required." }, { status: 400 });
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }
  if (phone.length < 6) return NextResponse.json({ error: "A valid phone number is required." }, { status: 400 });
  if (quantity < 1) return NextResponse.json({ error: "Quantity must be at least 1." }, { status: 400 });
  if (fulfillment === "delivery" && (!region || !city || !street)) {
    return NextResponse.json(
      { error: "Region, city and street are required for delivery." },
      { status: 400 },
    );
  }

  const admin = getSupabaseAdmin();

  // 1) Look up the e-book (published).
  const { data: ebookData, error: ebookErr } = await admin
    .from("ebooks")
    .select("*")
    .eq("slug", ebookSlug)
    .eq("published", true)
    .maybeSingle();
  if (ebookErr) return NextResponse.json({ error: ebookErr.message }, { status: 500 });
  if (!ebookData) return NextResponse.json({ error: "E-book not found." }, { status: 404 });
  const ebook = ebookData as EbookRow;

  // Physical copies use the dedicated physical price, falling back to the digital price.
  const physical = ebook.physical_price_cents;
  const unitPrice =
    typeof physical === "number" && physical > 0
      ? Math.round(physical)
      : Math.max(0, Math.round(Number(ebook.price_cents ?? 0)));
  const subtotal = unitPrice * quantity;

  // 2) Stock enforcement (only when the column exists in the row).
  const stockTracked = typeof ebook.stock_quantity === "number";
  const currentStock = stockTracked ? (ebook.stock_quantity as number) : 0;
  if (stockTracked && currentStock < quantity) {
    return NextResponse.json(
      {
        error:
          currentStock <= 0
            ? "This title is currently out of stock."
            : `Only ${currentStock} cop${currentStock === 1 ? "y" : "ies"} left in stock.`,
      },
      { status: 409 },
    );
  }

  // 3) Voucher (optional).
  let discountCents = 0;
  let appliedVoucher: string | null = null;
  if (voucherCode) {
    const v = await validateVoucher(admin, voucherCode, subtotal);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
    discountCents = v.discountCents;
    appliedVoucher = normalizeVoucherCode(voucherCode);
  }

  const total = Math.max(0, subtotal - discountCents);

  // 4) Reserve stock before creating the order (avoids overselling).
  if (stockTracked) {
    const reserved = await decrementStock(admin, ebook.id, quantity);
    if (!reserved) {
      return NextResponse.json(
        { error: "Sorry, stock changed while ordering. Please try again." },
        { status: 409 },
      );
    }
  }

  // 5) Create the order. (Voucher redeemed only AFTER a successful insert.)
  const orderRef = makeOrderRef();
  const { data: order, error: insErr } = await admin
    .from("physical_orders")
    .insert({
      order_ref: orderRef,
      ebook_id: ebook.id,
      ebook_slug: ebook.slug,
      ebook_title: ebook.title,
      customer_name: customerName,
      email,
      phone,
      quantity,
      fulfillment,
      region: fulfillment === "delivery" ? region || null : null,
      city: fulfillment === "delivery" ? city || null : null,
      street: fulfillment === "delivery" ? street || null : null,
      unit_price_cents: unitPrice,
      subtotal_cents: subtotal,
      voucher_code: appliedVoucher,
      discount_cents: discountCents,
      total_cents: total,
      status: "new",
      notes: notes || null,
    })
    .select("id, order_ref, total_cents")
    .maybeSingle();

  if (insErr) {
    if (stockTracked) await incrementStock(admin, ebook.id, quantity);
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  // 6) Redeem the voucher now that the order is committed (best-effort).
  if (appliedVoucher) await redeemVoucher(admin, appliedVoucher);

  // 7) Email the customer their order confirmation / invoice (best-effort, once per order).
  try {
    await sendEmailOnce(
      admin,
      { ref: orderRef, kind: "order_invoice", to: email },
      () =>
        physicalOrderInvoiceEmail({
          orderRef,
          customerName,
          itemTitle: ebook.title || "Book",
          quantity,
          unitMinor: unitPrice,
          subtotalMinor: subtotal,
          discountMinor: discountCents,
          totalMinor: total,
          voucherCode: appliedVoucher,
          fulfillment,
          region,
          city,
          street,
          phone,
        }),
    );
  } catch (e) {
    console.error("[orders] invoice email failed:", (e as Error).message);
  }

  return NextResponse.json({
    ok: true,
    order_ref: order?.order_ref ?? orderRef,
    total_cents: total,
    subtotal_cents: subtotal,
    discount_cents: discountCents,
  });
}
