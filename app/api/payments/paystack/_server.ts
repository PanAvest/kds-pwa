import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  isMatchingSuccessfulCharge,
  type SignedPaystackMetadata,
  validateSignedPaystackMetadata,
} from "@/lib/payments/paystack";

type PaystackCharge = {
  amount?: unknown;
  currency?: unknown;
  metadata?: unknown;
  reference?: unknown;
  status?: unknown;
};

type PaymentResult =
  | {
      ok: true;
      charge: {
        amount: number;
        currency: string;
        reference: string;
      };
      metadata: SignedPaystackMetadata;
    }
  | {
      ok: false;
      error: string;
      status: number;
    };

export async function fetchPaystackVerification(reference: string) {
  const secret = process.env.PAYSTACK_SECRET_KEY?.trim();
  if (!secret) {
    throw new Error("Missing PAYSTACK_SECRET_KEY.");
  }

  const res = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    {
      headers: { Authorization: `Bearer ${secret}` },
      cache: "no-store",
    }
  );
  const payload = await res.json().catch(() => null);

  if (!res.ok) {
    const message =
      payload && typeof payload === "object" && "message" in payload
        ? String((payload as { message?: unknown }).message ?? "Verification failed.")
        : "Verification failed.";
    throw new Error(message);
  }

  return payload;
}

function validateSuccessfulCharge(rawCharge: unknown): PaymentResult {
  if (!rawCharge || typeof rawCharge !== "object") {
    return { ok: false, error: "Missing Paystack charge payload.", status: 400 };
  }

  const charge = rawCharge as PaystackCharge;
  const reference =
    typeof charge.reference === "string" ? charge.reference.trim() : "";
  if (!reference) {
    return { ok: false, error: "Missing Paystack reference.", status: 400 };
  }

  const metaValidation = validateSignedPaystackMetadata(charge.metadata);
  if (!metaValidation.ok) {
    return { ok: false, error: metaValidation.error, status: 400 };
  }

  if (!isMatchingSuccessfulCharge(charge, metaValidation.metadata)) {
    return {
      ok: false,
      error: "Paystack verification did not match the signed payment details.",
      status: 400,
    };
  }

  return {
    ok: true,
    charge: {
      amount: Number(charge.amount),
      currency: metaValidation.metadata.currency,
      reference,
    },
    metadata: metaValidation.metadata,
  };
}

async function recordSuccessfulPayment(result: Extract<PaymentResult, { ok: true }>) {
  const supabase = getSupabaseAdmin();
  const { charge, metadata } = result;
  const { error } = await supabase.from("payments").insert({
    provider: "paystack",
    reference: charge.reference,
    user_id: metadata.user_id,
    amount_minor: charge.amount,
    currency: charge.currency,
    status: "success",
    meta: metadata,
    created_at: new Date().toISOString(),
  });

  if (error) {
    console.error("Failed to record Paystack payment audit row", {
      message: error.message,
      reference: charge.reference,
    });
  }
}

export async function grantSuccessfulPaystackCharge(rawCharge: unknown): Promise<PaymentResult> {
  const validated = validateSuccessfulCharge(rawCharge);
  if (!validated.ok) return validated;

  const supabase = getSupabaseAdmin();
  const { metadata } = validated;

  if (metadata.kind === "course") {
    const { error } = await supabase.from("enrollments").upsert(
      {
        user_id: metadata.user_id,
        course_id: metadata.course_id,
        paid: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,course_id" }
    );

    if (error) {
      return { ok: false, error: error.message, status: 500 };
    }
  } else {
    const { error } = await supabase.from("ebook_purchases").upsert(
      {
        user_id: metadata.user_id,
        ebook_id: metadata.ebook_id,
        status: "paid",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,ebook_id" }
    );

    if (error) {
      return { ok: false, error: error.message, status: 500 };
    }
  }

  await recordSuccessfulPayment(validated);
  return validated;
}
