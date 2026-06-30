// lib/emailTemplates.ts
// Email-safe HTML (inline styles, table layout). No imports — usable anywhere.

const NAVY = "#0a1156";
const BRAND = "#b65437";
const GOLD = "#d2a756";
const INK = "#2c2522";
const MUTED = "#6b6259";
const BG = "#faf7f2";
const LINE = "#ece3d8";

const BRAND_NAME = "PanAvest";

function money(minor: number | null | undefined, currency = "GHS"): string {
  if (typeof minor !== "number" || !Number.isFinite(minor)) return "—";
  const code = (currency || "GHS").toUpperCase();
  const symbol = code === "GHS" ? "GH₵" : `${code} `;
  return `${symbol}${(minor / 100).toFixed(2)}`;
}

function fmtDate(value: string | null | undefined): string {
  if (!value) return new Date().toUTCString().replace(" GMT", " UTC");
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toUTCString().replace(" GMT", " UTC");
}

function esc(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function layout(title: string, inner: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid ${LINE};">
        <tr><td style="background:${NAVY};padding:22px 28px;">
          <span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:.3px;">${BRAND_NAME}</span>
          <span style="color:${GOLD};font-size:13px;float:right;padding-top:6px;">${esc(title)}</span>
        </td></tr>
        <tr><td style="padding:28px;">${inner}</td></tr>
        <tr><td style="padding:18px 28px;background:${BG};border-top:1px solid ${LINE};color:${MUTED};font-size:12px;line-height:1.6;">
          ${BRAND_NAME} · Knowledge Development Series<br/>
          This is an automated message. Reply to this email if you need help.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function rowKV(label: string, value: string, strong = false): string {
  return `<tr>
    <td style="padding:7px 0;color:${MUTED};font-size:13px;">${esc(label)}</td>
    <td style="padding:7px 0;text-align:right;font-size:13px;color:${INK};font-weight:${strong ? 700 : 500};">${value}</td>
  </tr>`;
}

export type PurchaseReceiptData = {
  customerName?: string | null;
  itemTitle: string;
  itemKind: "course" | "ebook";
  amountMinor: number | null;
  currency?: string | null;
  reference: string;
  paidAt?: string | null;
  channel?: string | null;
  invoiceNo: string;
  voucherCode?: string | null;
  discountMinor?: number | null;
  appUrl?: string;
};

/** Combined email containing BOTH the Paystack payment receipt and the PanAvest website invoice. */
export function purchaseReceiptEmail(d: PurchaseReceiptData): { subject: string; html: string } {
  const cur = d.currency || "GHS";
  const greeting = d.customerName ? `Hi ${esc(d.customerName.split(" ")[0])},` : "Hi there,";
  const itemLabel = d.itemKind === "course" ? "Course / Programme" : "E-book";
  const discount = d.discountMinor && d.discountMinor > 0 ? d.discountMinor : 0;
  const subtotal = (d.amountMinor ?? 0) + discount;

  const inner = `
    <p style="margin:0 0 6px;font-size:16px;font-weight:600;">${greeting}</p>
    <p style="margin:0 0 20px;color:${MUTED};font-size:14px;line-height:1.6;">
      Thank you for your purchase. Your payment was successful and access has been unlocked.
      Both your <strong>payment receipt</strong> and your <strong>${BRAND_NAME} invoice</strong> are below.
    </p>

    <!-- Website invoice -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${LINE};border-radius:10px;margin-bottom:18px;">
      <tr><td style="padding:14px 18px;background:${BG};border-bottom:1px solid ${LINE};">
        <span style="font-size:13px;font-weight:700;color:${NAVY};">${BRAND_NAME} INVOICE</span>
        <span style="font-size:12px;color:${MUTED};float:right;">No. ${esc(d.invoiceNo)}</span>
      </td></tr>
      <tr><td style="padding:14px 18px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${rowKV(itemLabel, esc(d.itemTitle), true)}
          ${rowKV("Subtotal", money(subtotal, cur))}
          ${discount ? rowKV(`Discount${d.voucherCode ? ` (${esc(d.voucherCode)})` : ""}`, "− " + money(discount, cur)) : ""}
          <tr><td colspan="2" style="border-top:1px solid ${LINE};padding-top:6px;"></td></tr>
          ${rowKV("Total paid", money(d.amountMinor, cur), true)}
        </table>
      </td></tr>
    </table>

    <!-- Paystack receipt -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${LINE};border-radius:10px;">
      <tr><td style="padding:14px 18px;background:${BG};border-bottom:1px solid ${LINE};">
        <span style="font-size:13px;font-weight:700;color:${BRAND};">PAYMENT RECEIPT (Paystack)</span>
      </td></tr>
      <tr><td style="padding:14px 18px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${rowKV("Reference", esc(d.reference), true)}
          ${rowKV("Amount", money(d.amountMinor, cur), true)}
          ${d.channel ? rowKV("Channel", esc(d.channel)) : ""}
          ${rowKV("Date", fmtDate(d.paidAt))}
          ${rowKV("Status", "Success")}
        </table>
      </td></tr>
    </table>

    <p style="margin:22px 0 0;">
      <a href="${esc(d.appUrl || "https://panavestkds.com")}/dashboard" style="display:inline-block;background:${NAVY};color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 22px;border-radius:9px;">Go to my dashboard</a>
    </p>
  `;
  return {
    subject: `Your ${BRAND_NAME} receipt & invoice — ${d.reference}`,
    html: layout("Payment receipt", inner),
  };
}

export type PhysicalOrderInvoiceData = {
  orderRef: string;
  customerName: string;
  itemTitle: string;
  quantity: number;
  unitMinor: number;
  subtotalMinor: number;
  discountMinor: number;
  totalMinor: number;
  voucherCode?: string | null;
  fulfillment: "delivery" | "pickup";
  region?: string | null;
  city?: string | null;
  street?: string | null;
  phone?: string | null;
  appUrl?: string;
};

/** Website invoice / order confirmation for a physical (printed) book order. */
export function physicalOrderInvoiceEmail(d: PhysicalOrderInvoiceData): { subject: string; html: string } {
  const cur = "GHS";
  const addr =
    d.fulfillment === "delivery"
      ? `${esc(d.street ?? "")}${d.street ? ", " : ""}${esc(d.city ?? "")}${d.city && d.region ? ", " : ""}${esc(d.region ?? "")}`
      : "Pickup at our office";
  const inner = `
    <p style="margin:0 0 6px;font-size:16px;font-weight:600;">Hi ${esc(d.customerName.split(" ")[0] || "there")},</p>
    <p style="margin:0 0 20px;color:${MUTED};font-size:14px;line-height:1.6;">
      We&rsquo;ve received your order for a printed copy. Our team will contact you${d.phone ? ` on <strong>${esc(d.phone)}</strong>` : ""} to confirm
      ${d.fulfillment === "pickup" ? "pickup" : "delivery"} and arrange payment for the book(s).
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${LINE};border-radius:10px;">
      <tr><td style="padding:14px 18px;background:${BG};border-bottom:1px solid ${LINE};">
        <span style="font-size:13px;font-weight:700;color:${NAVY};">ORDER INVOICE</span>
        <span style="font-size:12px;color:${MUTED};float:right;">${esc(d.orderRef)}</span>
      </td></tr>
      <tr><td style="padding:14px 18px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${rowKV("Title", esc(d.itemTitle), true)}
          ${rowKV("Quantity", `${d.quantity} × ${money(d.unitMinor, cur)}`)}
          ${rowKV("Subtotal", money(d.subtotalMinor, cur))}
          ${d.discountMinor > 0 ? rowKV(`Discount${d.voucherCode ? ` (${esc(d.voucherCode)})` : ""}`, "− " + money(d.discountMinor, cur)) : ""}
          <tr><td colspan="2" style="border-top:1px solid ${LINE};padding-top:6px;"></td></tr>
          ${rowKV("Total for books", money(d.totalMinor, cur), true)}
          ${rowKV(d.fulfillment === "pickup" ? "Pickup" : "Deliver to", addr)}
        </table>
      </td></tr>
    </table>

    <p style="margin:18px 0 0;padding:12px 14px;background:${BG};border-radius:9px;color:${MUTED};font-size:12px;line-height:1.6;">
      Delivery charges are not included above. Delivery is arranged separately and the cost is paid by the customer on delivery.
      Pickup orders have no delivery charge.
    </p>
  `;
  return {
    subject: `Your ${BRAND_NAME} order ${d.orderRef}`,
    html: layout("Order confirmation", inner),
  };
}

export type CertificateEmailData = {
  fullName: string;
  courseTitle: string;
  certificateNo: string;
  scorePct?: number | null;
  issuedAt?: string | null;
  verifyUrl: string;
  downloadUrl: string;
};

/** Congratulations email delivering the certificate (with secure download + verify links). */
export function certificateEmail(d: CertificateEmailData): { subject: string; html: string } {
  const inner = `
    <p style="margin:0 0 6px;font-size:16px;font-weight:600;">Congratulations, ${esc(d.fullName)}! 🎓</p>
    <p style="margin:0 0 20px;color:${MUTED};font-size:14px;line-height:1.6;">
      You have successfully completed <strong>${esc(d.courseTitle)}</strong>. Your certificate has been issued.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:2px solid ${GOLD};border-radius:12px;background:${BG};">
      <tr><td style="padding:26px 24px;text-align:center;">
        <div style="font-size:12px;letter-spacing:2px;color:${MUTED};text-transform:uppercase;">Certificate of Completion</div>
        <div style="font-size:22px;font-weight:700;color:${NAVY};margin:10px 0 4px;">${esc(d.fullName)}</div>
        <div style="font-size:14px;color:${INK};">${esc(d.courseTitle)}</div>
        ${typeof d.scorePct === "number" ? `<div style="font-size:13px;color:${MUTED};margin-top:8px;">Score: ${d.scorePct}%</div>` : ""}
        <div style="font-size:12px;color:${MUTED};margin-top:12px;">Certificate No.</div>
        <div style="font-size:15px;font-weight:700;color:${BRAND};letter-spacing:1px;">${esc(d.certificateNo)}</div>
        ${d.issuedAt ? `<div style="font-size:12px;color:${MUTED};margin-top:8px;">Issued ${fmtDate(d.issuedAt)}</div>` : ""}
      </td></tr>
    </table>

    <p style="margin:22px 0 0;text-align:center;">
      <a href="${esc(d.downloadUrl)}" style="display:inline-block;background:${NAVY};color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 22px;border-radius:9px;margin:4px;">Download certificate</a>
      <a href="${esc(d.verifyUrl)}" style="display:inline-block;background:#fff;color:${NAVY};text-decoration:none;font-size:14px;font-weight:600;padding:11px 22px;border-radius:9px;border:1px solid ${LINE};margin:4px;">Verify certificate</a>
    </p>
  `;
  return {
    subject: `🎓 Your ${BRAND_NAME} certificate — ${esc(d.courseTitle)}`,
    html: layout("Certificate issued", inner),
  };
}
