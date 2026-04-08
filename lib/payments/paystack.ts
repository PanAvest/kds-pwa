import crypto from "crypto";

export const PAYSTACK_CURRENCY = "GHS";

type PaystackKind = "course" | "ebook";

type BasePaystackMetadata = {
  kind: PaystackKind;
  user_id: string;
  slug: string;
  amount_minor: number;
  currency: string;
  email: string;
  course_id?: string;
  ebook_id?: string;
};

export type SignedPaystackMetadata = BasePaystackMetadata & {
  sig: string;
};

function getMetadataSigningSecret() {
  const secret =
    process.env.PAYSTACK_METADATA_SECRET?.trim() ||
    process.env.PAYSTACK_WEBHOOK_SECRET?.trim() ||
    process.env.PAYSTACK_SECRET_KEY?.trim() ||
    "";

  if (!secret) {
    throw new Error("Missing Paystack metadata signing secret.");
  }

  return secret;
}

function signaturePayload(meta: BasePaystackMetadata) {
  return [
    meta.kind,
    meta.user_id,
    meta.course_id ?? "",
    meta.ebook_id ?? "",
    meta.slug,
    String(meta.amount_minor),
    meta.currency.toUpperCase(),
    meta.email.trim().toLowerCase(),
  ].join("|");
}

function signMetadata(meta: BasePaystackMetadata) {
  return crypto
    .createHmac("sha256", getMetadataSigningSecret())
    .update(signaturePayload(meta))
    .digest("hex");
}

function safeSignatureMatch(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function createSignedPaystackMetadata(meta: BasePaystackMetadata): SignedPaystackMetadata {
  return {
    ...meta,
    currency: meta.currency.toUpperCase(),
    email: meta.email.trim().toLowerCase(),
    sig: signMetadata({
      ...meta,
      currency: meta.currency.toUpperCase(),
      email: meta.email.trim().toLowerCase(),
    }),
  };
}

export function validateSignedPaystackMetadata(value: unknown) {
  if (!value || typeof value !== "object") {
    return { ok: false as const, error: "Missing payment metadata." };
  }

  const raw = value as Partial<SignedPaystackMetadata>;
  const kind = raw.kind === "ebook" ? "ebook" : raw.kind === "course" ? "course" : null;
  const userId = typeof raw.user_id === "string" ? raw.user_id.trim() : "";
  const slug = typeof raw.slug === "string" ? raw.slug.trim() : "";
  const email = typeof raw.email === "string" ? raw.email.trim().toLowerCase() : "";
  const sig = typeof raw.sig === "string" ? raw.sig.trim() : "";
  const amountMinor = Number(raw.amount_minor);
  const currency = typeof raw.currency === "string" ? raw.currency.trim().toUpperCase() : "";
  const courseId = typeof raw.course_id === "string" ? raw.course_id.trim() : undefined;
  const ebookId = typeof raw.ebook_id === "string" ? raw.ebook_id.trim() : undefined;

  if (!kind || !userId || !slug || !email || !sig) {
    return { ok: false as const, error: "Incomplete payment metadata." };
  }
  if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
    return { ok: false as const, error: "Invalid payment amount." };
  }
  if (!currency) {
    return { ok: false as const, error: "Missing payment currency." };
  }
  if (kind === "course" && !courseId) {
    return { ok: false as const, error: "Missing course metadata." };
  }
  if (kind === "ebook" && !ebookId) {
    return { ok: false as const, error: "Missing ebook metadata." };
  }

  const normalized: BasePaystackMetadata = {
    kind,
    user_id: userId,
    slug,
    amount_minor: amountMinor,
    currency,
    email,
    course_id: courseId,
    ebook_id: ebookId,
  };

  const expectedSig = signMetadata(normalized);
  if (!safeSignatureMatch(sig, expectedSig)) {
    return { ok: false as const, error: "Payment metadata signature mismatch." };
  }

  return {
    ok: true as const,
    metadata: {
      ...normalized,
      sig,
    },
  };
}

export function isMatchingSuccessfulCharge(
  charge: { status?: unknown; amount?: unknown; currency?: unknown },
  metadata: SignedPaystackMetadata
) {
  const status = typeof charge.status === "string" ? charge.status : "";
  const amount = Number(charge.amount);
  const currency = typeof charge.currency === "string" ? charge.currency.toUpperCase() : "";

  return (
    status === "success" &&
    Number.isFinite(amount) &&
    amount === metadata.amount_minor &&
    currency === metadata.currency
  );
}
