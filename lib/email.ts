// lib/email.ts
import type { SupabaseClient } from "@supabase/supabase-js";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export type EmailAttachment = {
  filename: string;
  /** Base64-encoded file content (no data: prefix). */
  content: string;
};

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
};

export type SendEmailResult = { ok: boolean; id?: string; error?: string; skipped?: boolean };

function fromAddress(): string {
  return process.env.EMAIL_FROM || "PanAvest <noreply@panavestkds.com>";
}

/**
 * Send an email via Resend. If RESEND_API_KEY is not configured, this is a
 * graceful no-op (returns {ok:true, skipped:true}) so purchase / certificate
 * flows are never blocked by missing email config.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn("[email] RESEND_API_KEY not set — skipping send to", input.to);
    return { ok: true, skipped: true };
  }
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: fromAddress(),
        to: Array.isArray(input.to) ? input.to : [input.to],
        subject: input.subject,
        html: input.html,
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
        ...(input.attachments && input.attachments.length ? { attachments: input.attachments } : {}),
      }),
    });
    const json = (await res.json().catch(() => null)) as { id?: string; message?: string } | null;
    if (!res.ok) {
      const error = json?.message || `Resend error ${res.status}`;
      console.error("[email] send failed:", error);
      return { ok: false, error };
    }
    return { ok: true, id: json?.id };
  } catch (e) {
    const error = (e as Error).message || "send failed";
    console.error("[email] send threw:", error);
    return { ok: false, error };
  }
}

/**
 * Send an email at most once for a given (ref, kind). Uses email_log as a
 * claim: insert first; if it conflicts, another request already sent it.
 * Resilient to a missing email_log table (falls back to sending without the guard).
 */
export async function sendEmailOnce(
  admin: SupabaseClient,
  opts: { ref: string; kind: string; to: string },
  build: () => Omit<SendEmailInput, "to"> | Promise<Omit<SendEmailInput, "to">>,
): Promise<SendEmailResult> {
  // Try to claim the (ref, kind) slot.
  let claimed = false;
  try {
    const { error } = await admin
      .from("email_log")
      .insert({ ref: opts.ref, kind: opts.kind, to_email: opts.to });
    if (!error) {
      claimed = true;
    } else if (error.code === "23505") {
      // Already sent — skip.
      return { ok: true, skipped: true };
    } else {
      const text = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
      // Missing table → proceed without idempotency guard (best-effort).
      if (!(text.includes("email_log") || error.code === "42P01" || text.includes("does not exist"))) {
        // Unexpected error — still attempt to send rather than silently drop.
        console.warn("[email] email_log claim error:", error.message);
      }
    }
  } catch (e) {
    console.warn("[email] email_log claim threw:", (e as Error).message);
  }

  const releaseClaim = async () => {
    if (!claimed) return;
    try {
      await admin.from("email_log").delete().eq("ref", opts.ref).eq("kind", opts.kind);
    } catch {
      /* ignore */
    }
  };

  // Build the email body. If this throws (template error), nothing was sent —
  // release the claim so a later attempt can try again.
  let content: Omit<SendEmailInput, "to">;
  try {
    content = await build();
  } catch (e) {
    await releaseClaim();
    return { ok: false, error: (e as Error).message || "template build failed" };
  }

  const result = await sendEmail({ ...content, to: opts.to });

  // Release the claim ONLY when the email was genuinely not sent because email
  // is unconfigured (skipped). On a real send failure we KEEP the claim: the
  // request may have already reached the provider and been delivered, so letting
  // another path (callback/verify/webhook) re-send would risk a duplicate.
  // We deliberately prefer at-most-once over the risk of double receipts.
  if (result.skipped) {
    await releaseClaim();
  }
  return result;
}
