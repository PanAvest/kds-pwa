export type PaystackVerifyPayload = {
  reference: string;
  kind?: "course" | "ebook";
  slug?: string;
  error?: string;
};

export type PaystackVerifyResponse = PaystackVerifyPayload & {
  ok: boolean;
};

export const PAYSTACK_NATIVE_EVENT = "paystackNativeVerified";

const toErrorPayload = (reference: string, error?: string): PaystackVerifyResponse => ({
  ok: false,
  reference,
  error,
});

export async function verifyPaystackReference(reference: string): Promise<PaystackVerifyResponse> {
  if (!reference) {
    return toErrorPayload(reference, "Missing reference");
  }

  try {
    const res = await fetch(`/api/payments/paystack/verify?reference=${encodeURIComponent(reference)}`, {
      cache: "no-store",
    });
    let body: any = {};
    try {
      body = await res.json();
    } catch {
      // ignore JSON parse errors
    }

    const result: PaystackVerifyResponse = {
      ok: Boolean(body?.ok),
      reference,
      kind: body?.kind,
      slug: body?.slug,
      error: body?.error,
    };

    return result;
  } catch (error) {
    return toErrorPayload(reference, (error as Error).message);
  }
}

export async function pollPaystackReference(
  reference: string,
  maxAttempts = 8,
  intervalMs = 2000
): Promise<PaystackVerifyResponse> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const result = await verifyPaystackReference(reference);
    if (result.ok) {
      emitPaystackNativeVerified(result);
      return result;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return { ok: false, reference, error: "Payment not confirmed yet" };
}

export function emitPaystackNativeVerified(payload: PaystackVerifyResponse) {
  if (typeof window === "undefined") return;
  const event = new CustomEvent(PAYSTACK_NATIVE_EVENT, { detail: payload });
  window.dispatchEvent(event);
}
