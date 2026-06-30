"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Check } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { GHANA_REGIONS, citiesForRegion } from "@/lib/ghana";

type Info = {
  id: string;
  slug: string;
  title: string;
  cover_url: string | null;
  price_cents: number;
  physical_price_cents: number | null;
  stock_quantity: number | null;
  show_stock: boolean;
};

type Fulfillment = "delivery" | "pickup";

type VoucherState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "applied"; code: string; discountCents: number; label: string }
  | { kind: "error"; message: string };

const ghc = (cents: number) => `GH₵ ${(cents / 100).toFixed(2)}`;

const inputCls =
  "w-full rounded-xl border border-[color:var(--color-light)] bg-white px-3 py-2.5 text-[15px] outline-none focus:ring-2 focus:ring-[var(--color-accent-gold)]";

export default function PhysicalOrderPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";

  const [info, setInfo] = useState<Info | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [fulfillment, setFulfillment] = useState<Fulfillment>("delivery");
  const [region, setRegion] = useState("");
  const [city, setCity] = useState("");
  const [street, setStreet] = useState("");
  const [notes, setNotes] = useState("");

  const [voucherInput, setVoucherInput] = useState("");
  const [voucher, setVoucher] = useState<VoucherState>({ kind: "idle" });

  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ ref: string; total: number } | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const r = await fetch(`/api/ebooks/physical-info/${encodeURIComponent(slug)}`, {
          cache: "no-store",
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || "Could not load this title.");
        if (active) setInfo(j as Info);
      } catch (e) {
        if (active) setLoadErr((e as Error).message);
      }
      // Prefill name/email from the signed-in session, if any.
      try {
        const { data } = await supabase.auth.getSession();
        const user = data.session?.user;
        if (active && user) {
          if (user.email) setEmail((prev) => prev || user.email!);
          const fullName = (user.user_metadata?.full_name as string | undefined) ?? "";
          if (fullName) setName((prev) => prev || fullName);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      active = false;
    };
  }, [slug]);

  const cities = useMemo(() => citiesForRegion(region), [region]);

  const unitPrice =
    info?.physical_price_cents != null && info.physical_price_cents > 0
      ? info.physical_price_cents
      : info?.price_cents ?? 0;
  const subtotal = unitPrice * Math.max(1, quantity);
  const discountCents = voucher.kind === "applied" ? Math.min(subtotal, voucher.discountCents) : 0;
  const total = Math.max(0, subtotal - discountCents);

  const stockTracked = info ? typeof info.stock_quantity === "number" : false;
  const stockLeft = stockTracked ? (info?.stock_quantity as number) : null;
  const outOfStock = stockTracked && (stockLeft ?? 0) <= 0;

  // Re-validate the voucher when the subtotal changes.
  useEffect(() => {
    if (voucher.kind !== "applied") return;
    let active = true;
    (async () => {
      try {
        const r = await fetch("/api/vouchers/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: voucher.code, subtotal_cents: subtotal }),
        });
        const j = await r.json();
        if (!active) return;
        if (j?.ok) setVoucher({ kind: "applied", code: j.code, discountCents: j.discount_cents, label: j.label });
        else setVoucher({ kind: "error", message: j?.error || "Voucher no longer valid." });
      } catch {
        /* keep current */
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtotal]);

  async function applyVoucher() {
    const code = voucherInput.trim();
    if (!code) return;
    setVoucher({ kind: "checking" });
    try {
      const r = await fetch("/api/vouchers/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, subtotal_cents: subtotal }),
      });
      const j = await r.json();
      if (j?.ok) setVoucher({ kind: "applied", code: j.code, discountCents: j.discount_cents, label: j.label });
      else setVoucher({ kind: "error", message: j?.error || "Invalid voucher code." });
    } catch {
      setVoucher({ kind: "error", message: "Could not check voucher. Try again." });
    }
  }

  function clearVoucher() {
    setVoucher({ kind: "idle" });
    setVoucherInput("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitErr(null);
    if (!name.trim()) return setSubmitErr("Please enter your full name.");
    if (!email.trim()) return setSubmitErr("Please enter your email.");
    if (!phone.trim()) return setSubmitErr("Please enter your phone number.");
    if (fulfillment === "delivery") {
      if (!region) return setSubmitErr("Please select your region.");
      if (!city) return setSubmitErr("Please select your city/town.");
      if (!street.trim()) return setSubmitErr("Please enter your street / house address.");
    }
    setSubmitting(true);
    try {
      const r = await fetch("/api/orders/physical", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ebook_slug: slug,
          customer_name: name,
          email,
          phone,
          quantity,
          fulfillment,
          region: fulfillment === "delivery" ? region : null,
          city: fulfillment === "delivery" ? city : null,
          street: fulfillment === "delivery" ? street : null,
          voucher_code: voucher.kind === "applied" ? voucher.code : null,
          notes,
        }),
      });
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error || "Could not place your order.");
      setDone({ ref: j.order_ref, total: j.total_cents });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setSubmitErr((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loadErr) {
    return (
      <main className="mx-auto max-w-lg px-4 py-12 text-center">
        <h1 className="text-xl font-bold">Title unavailable</h1>
        <p className="mt-2 text-[color:var(--color-text-muted)]">{loadErr}</p>
        <Link
          href="/ebooks"
          className="mt-6 inline-block rounded-xl bg-[var(--color-accent-red)] px-5 py-2.5 text-white"
        >
          Back to E-Books
        </Link>
      </main>
    );
  }

  if (done) {
    return (
      <main className="mx-auto max-w-lg px-4 py-12">
        <div className="rounded-2xl border border-[color:var(--color-light)] bg-white p-6 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-green-100 text-green-700">
            <Check className="h-7 w-7" />
          </div>
          <h1 className="mt-4 text-xl font-bold">Order received!</h1>
          <p className="mt-2 text-[color:var(--color-text-muted)]">
            Thank you, {name.split(" ")[0] || "friend"}. Your reference is{" "}
            <span className="font-semibold text-[color:var(--color-text-dark)]">{done.ref}</span>.
          </p>
          <p className="mt-2 text-sm text-[color:var(--color-text-muted)]">
            Our team will contact you on <span className="font-medium">{phone}</span> to confirm{" "}
            {fulfillment === "pickup" ? "pickup" : "delivery"} and arrange payment of{" "}
            <span className="font-semibold text-[color:var(--color-text-dark)]">{ghc(done.total)}</span> for the book(s).
          </p>
          <div className="mt-4 rounded-xl bg-[var(--color-bg)] p-3 text-xs text-[color:var(--color-text-muted)]">
            Delivery charges (where applicable) are arranged separately and paid by the customer on delivery.
          </div>
          <Link
            href="/ebooks"
            className="mt-6 inline-block rounded-xl bg-[var(--color-accent-red)] px-5 py-2.5 text-white"
          >
            Done
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-6 pb-24">
      <Link
        href={`/ebooks/${encodeURIComponent(slug)}`}
        className="inline-flex items-center gap-1 text-sm text-[color:var(--color-text-muted)]"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>
      <h1 className="mt-3 text-2xl font-bold">Buy a physical copy</h1>
      <p className="mt-1 text-sm text-[color:var(--color-text-muted)]">
        Order a printed copy delivered to you or ready for pickup. We&apos;ll call to confirm and arrange payment.
      </p>

      {/* Book summary */}
      <div className="mt-5 flex items-center gap-3 rounded-2xl border border-[color:var(--color-light)] bg-white p-3">
        {info?.cover_url ? (
          <Image
            src={info.cover_url}
            alt={info.title}
            width={48}
            height={64}
            className="h-16 w-12 rounded-md object-cover"
          />
        ) : (
          <div className="h-16 w-12 rounded-md bg-[color:var(--color-light)]/50" />
        )}
        <div className="min-w-0">
          <div className="truncate font-semibold">{info?.title ?? "Loading…"}</div>
          <div className="text-sm text-[color:var(--color-text-muted)]">{ghc(unitPrice)} each</div>
          {stockTracked && info?.show_stock && stockLeft != null && (
            <div className="text-xs text-[color:var(--color-text-muted)]">
              {stockLeft > 0 ? `${stockLeft} in stock` : "Out of stock"}
            </div>
          )}
        </div>
      </div>

      <form onSubmit={submit} className="mt-5 grid gap-4">
        <div className="grid gap-3 rounded-2xl border border-[color:var(--color-light)] bg-white p-4">
          <div className="text-sm font-semibold">Your details</div>
          <label className="grid gap-1">
            <span className="text-xs text-[color:var(--color-text-muted)]">Full name</span>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-[color:var(--color-text-muted)]">Email</span>
            <input
              className={inputCls}
              type="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-[color:var(--color-text-muted)]">Phone number</span>
            <input
              className={inputCls}
              inputMode="tel"
              placeholder="e.g. 024 123 4567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-[color:var(--color-text-muted)]">Quantity (number of books)</span>
            <input
              className={inputCls}
              type="number"
              min={1}
              max={stockTracked ? Math.max(1, stockLeft ?? 1) : 999}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
              required
            />
          </label>
        </div>

        <div className="grid gap-3 rounded-2xl border border-[color:var(--color-light)] bg-white p-4">
          <div className="text-sm font-semibold">How would you like to receive it?</div>
          <div className="grid grid-cols-2 gap-2">
            {(["delivery", "pickup"] as Fulfillment[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFulfillment(f)}
                className={`rounded-xl border p-3 text-left text-sm transition ${
                  fulfillment === f
                    ? "border-[var(--color-accent-red)] bg-[var(--color-accent-red)]/10"
                    : "border-[color:var(--color-light)] bg-white"
                }`}
              >
                <div className="font-semibold capitalize">{f}</div>
                <div className="text-xs text-[color:var(--color-text-muted)]">
                  {f === "delivery" ? "Courier to your address" : "Collect at our office"}
                </div>
              </button>
            ))}
          </div>

          {fulfillment === "delivery" && (
            <div className="grid gap-3">
              <label className="grid gap-1">
                <span className="text-xs text-[color:var(--color-text-muted)]">Region</span>
                <select
                  className={inputCls}
                  value={region}
                  onChange={(e) => {
                    setRegion(e.target.value);
                    setCity("");
                  }}
                  required
                >
                  <option value="">— Select region —</option>
                  {GHANA_REGIONS.map((r) => (
                    <option key={r.name} value={r.name}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1">
                <span className="text-xs text-[color:var(--color-text-muted)]">City / Town</span>
                <select
                  className={inputCls}
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  disabled={!region}
                  required
                >
                  <option value="">{region ? "— Select city/town —" : "Select a region first"}</option>
                  {cities.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1">
                <span className="text-xs text-[color:var(--color-text-muted)]">Street / House address</span>
                <input
                  className={inputCls}
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  placeholder="House number, street, landmark"
                  required
                />
              </label>
            </div>
          )}

          {fulfillment === "pickup" && (
            <p className="rounded-xl bg-[var(--color-bg)] p-3 text-xs text-[color:var(--color-text-muted)]">
              We&apos;ll share the pickup location and hours when we call to confirm your order.
            </p>
          )}

          <label className="grid gap-1">
            <span className="text-xs text-[color:var(--color-text-muted)]">Notes (optional)</span>
            <textarea
              className={inputCls}
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything we should know?"
            />
          </label>
        </div>

        {/* Voucher + totals */}
        <div className="grid gap-3 rounded-2xl border border-[color:var(--color-light)] bg-white p-4">
          <div className="text-sm font-semibold">Discount voucher</div>
          {voucher.kind === "applied" ? (
            <div className="flex items-center justify-between rounded-xl bg-green-50 px-3 py-2 text-sm text-green-800 ring-1 ring-green-200">
              <span>
                <span className="font-semibold">{voucher.code}</span> · {voucher.label}
              </span>
              <button type="button" onClick={clearVoucher} className="text-xs underline">
                Remove
              </button>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <input
                  className={`${inputCls} uppercase`}
                  value={voucherInput}
                  onChange={(e) => setVoucherInput(e.target.value)}
                  placeholder="Enter code"
                />
                <button
                  type="button"
                  onClick={applyVoucher}
                  disabled={voucher.kind === "checking" || !voucherInput.trim()}
                  className="shrink-0 rounded-xl border border-[color:var(--color-soft)] px-4 text-sm font-medium disabled:opacity-50"
                >
                  {voucher.kind === "checking" ? "…" : "Apply"}
                </button>
              </div>
              {voucher.kind === "error" && <div className="text-xs text-red-600">{voucher.message}</div>}
            </>
          )}

          <div className="mt-1 space-y-1.5 border-t border-[color:var(--color-light)] pt-3 text-sm">
            <div className="flex justify-between">
              <span className="text-[color:var(--color-text-muted)]">
                Subtotal ({quantity} × {ghc(unitPrice)})
              </span>
              <span className="font-medium">{ghc(subtotal)}</span>
            </div>
            {discountCents > 0 && (
              <div className="flex justify-between text-green-700">
                <span>Discount</span>
                <span className="font-medium">− {ghc(discountCents)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-[color:var(--color-light)] pt-1.5 text-base font-bold">
              <span>Total (books)</span>
              <span>{ghc(total)}</span>
            </div>
          </div>

          <div className="rounded-xl bg-[var(--color-bg)] p-3 text-xs text-[color:var(--color-text-muted)]">
            <span className="font-semibold text-[color:var(--color-text-dark)]">Please note:</span> delivery charges
            are not included. Delivery is arranged separately and paid by the customer on delivery. Pickup has no
            delivery charge.
          </div>
        </div>

        {submitErr && (
          <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{submitErr}</div>
        )}

        <button
          type="submit"
          disabled={submitting || outOfStock}
          className="w-full rounded-xl bg-[var(--color-accent-red)] py-3.5 text-[15px] font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
        >
          {outOfStock ? "Out of stock" : submitting ? "Placing order…" : "Place order"}
        </button>
      </form>
    </main>
  );
}
