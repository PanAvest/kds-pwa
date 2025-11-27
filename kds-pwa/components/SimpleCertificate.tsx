import React, { forwardRef, useId, useMemo, useRef, useState } from "react";
import { isNative, savePdfToDevice } from "@/lib/nativeDownload";
import { saveAndSharePdfBase64 } from "@/lib/nativePdf"; // Import the new helper function

/**
 * SimpleCertificate (A4 preview + print-only)
 * - Card-sized A4 portrait proportions (210 x 297 mm scaled to container)
 * - Single Print/Save button; hides everything else in print mode
 */
export type CertificateProps = {
  panavestLogo?: string;
  kdsLogo?: string;
  signature?: string;
  recipient: string;
  course: string;
  blurb?: string;
  signerName?: string;
  signerTitle?: string;
  date?: string | Date;
  certId?: string;
  accent?: string;
  className?: string;
  showPrint?: boolean;
  qrValue?: string;
  qrSize?: number;
  qrProvider?: "quickchart" | "goqr" | "none" | "img";
};

const fmt = (d?: string | Date) => {
  if (!d) return "";
  const x = typeof d === "string" ? new Date(d) : d;
  return isNaN(+x)
    ? String(d)
    : x.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
};

const genId = () => `KDS-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

const SimpleCertificate = forwardRef<HTMLDivElement, CertificateProps>(
  (
    {
      panavestLogo = "https://icujvqmqwacpysxjfkxd.supabase.co/storage/v1/object/public/Cert%20Assets/panavestlogo.png",
      kdsLogo = "https://icujvqmqwacpysxjfkxd.supabase.co/storage/v1/object/public/Cert%20Assets/logo.png",
      signature = "https://icujvqmqwacpysxjfkxd.supabase.co/storage/v1/object/public/Cert%20Assets/Prof%20Signature.png",
      recipient,
      course,
      blurb = "For successfully completing the prescribed curriculum and assessments.",
      signerName = "Prof. Douglas Boateng",
      signerTitle = "Executive Chairman, PanAvest International & KDS",
      date,
      certId,
      accent = "#0a1156",
      className = "",
      showPrint = true,
      qrValue,
      qrSize = 96,
      qrProvider = "quickchart",
    },
    ref
  ) => {
    const certRef = useRef<HTMLDivElement | null>(null);
    const captureRef = useRef<HTMLDivElement | null>(null);
    const captureId = useId();
    const resolvedId = useMemo(() => certId || genId(), [certId]);
    const value = qrValue || resolvedId;
    const provider = qrProvider === "img" ? "quickchart" : qrProvider;
    const qrUrl = useMemo(() => {
      if (provider === "none") return "";
      const d = encodeURIComponent(value);
      if (provider === "goqr")
        return `https://api.qrserver.com/v1/create-qr-code/?size=${qrSize}x${qrSize}&data=${d}&margin=1`;
      return `https://quickchart.io/qr?text=${d}&size=${qrSize}&margin=1`;
    }, [value, provider, qrSize]);

    const resolvedSignature = useMemo(
      () =>
        signature ||
        "https://icujvqmqwacpysxjfkxd.supabase.co/storage/v1/object/public/Cert%20Assets/Prof%20Signature.png",
      [signature],
    );

    const [downloading, setDownloading] = useState(false);

    const handleDownloadPdf = async () => {
      try {
        if (downloading) return;
        setDownloading(true);
        if (typeof window === "undefined") return;
        const node = captureRef.current || document.getElementById(captureId);
        if (!node) throw new Error("Certificate capture element missing");

        const bounds = node.getBoundingClientRect();
        if (!bounds.width || !bounds.height) throw new Error("Certificate preview is not visible");

        const { default: html2canvas } = await import("html2canvas");
        const canvas = await html2canvas(node as HTMLElement, {
          scale: 2,
          useCORS: true,
          backgroundColor: "#ffffff",
          ignoreElements: (el: Element) => {
            const tag = el.tagName?.toLowerCase?.() ?? "";
            return tag === "svg" || tag === "path";
          },
        });
        const imgData = canvas.toDataURL("image/png");
        const baseName = resolvedId ? `PanAvest-Certificate-${resolvedId}` : "PanAvest-Certificate";

        const { jsPDF } = await import("jspdf");
        const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
        const pageWidth = 210;
        const pageHeight = 297;
        const imgProps = { width: canvas.width, height: canvas.height };
        const imgRatio = imgProps.height / imgProps.width;
        const targetWidth = pageWidth;
        const targetHeight = targetWidth * imgRatio;
        let drawWidth = targetWidth;
        let drawHeight = targetHeight;
        let marginTop = 0;
        if (drawHeight > pageHeight) {
          drawHeight = pageHeight;
          drawWidth = drawHeight / imgRatio;
        } else {
          marginTop = (pageHeight - drawHeight) / 2;
        }
        const marginLeft = (pageWidth - drawWidth) / 2;
        pdf.addImage(imgData, "PNG", marginLeft, marginTop, drawWidth, drawHeight, undefined, "FAST");

        const filename = `${baseName}.pdf`;
        if (isNative()) {
          const pdfData = pdf.output("datauristring"); // Get PDF as base64
          await saveAndSharePdfBase64({ base64: pdfData, filename, title: "Certificate", text: "Here is your certificate!" });
        } else {
          pdf.save(filename);
        }
      } catch (err) {
        console.error("Certificate PDF generation failed", err);
        if (typeof window !== "undefined") {
          window.alert("We could not generate the certificate. Please keep the preview open and try again.");
        }
      } finally {
        setDownloading(false);
      }
    };

    return (
      <div className="w-full px-3 sm:px-0">
        <div
          ref={(el) => {
            if (typeof ref === "function") ref(el);
            else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = el;
            certRef.current = el;
          }}
          className={`kds-cert-print-root bg-white shadow-lg rounded-xl relative ${className}`}
          style={{
            border: `6px solid ${accent}`,
            width: "100%",
            maxWidth: "680px",
            aspectRatio: "210 / 297",
            margin: "0 auto",
            padding: "0",
            boxShadow: "0 10px 30px rgba(0,0,0,0.12)",
            overflow: "hidden",
            boxSizing: "border-box",
          }}
        >
          <div ref={captureRef} id={captureId} className="h-full flex flex-col">
            {/* Banner */}
            <div
              style={{
                background: "linear-gradient(135deg, #0a1156 0%, #0a1156 60%, #d2a756 60%, #f1d48f 100%)",
                padding: "18px 28px",
                color: "white",
              }}
              className="rounded-t-xl flex items-center justify-between gap-4"
            >
              <div className="text-left leading-tight">
                <p className="text-[11px] tracking-[0.28em] uppercase">Certificate</p>
                <p className="text-[11px] tracking-[0.16em] uppercase">of Appreciation</p>
              </div>
              <img src={kdsLogo} alt="KDS" className="h-14 w-auto" crossOrigin="anonymous" />
            </div>

            {/* Body */}
            <div className="flex-1 bg-white px-10 py-8 flex flex-col justify-between">
              <div className="text-center">
                <div className="text-xs text-gray-500 uppercase tracking-[0.2em]">Proudly Presented To</div>
                <div className="mt-3 text-4xl sm:text-5xl font-serif font-bold break-words" data-testid="recipient">
                  {recipient}
                </div>
                <div className="mt-4 text-sm text-gray-600">for successfully completing</div>
                <div className="mt-2 text-xl sm:text-2xl italic break-words" data-testid="course">
                  {course}
                </div>
                {blurb && (
                  <p className="mx-auto mt-4 max-w-2xl text-sm sm:text-base leading-7 text-gray-700 break-words" data-testid="blurb">
                    {blurb}
                  </p>
                )}
                <div className="mt-4 text-xs text-gray-500">Certificate No: {resolvedId}</div>
                {date && <div className="text-xs text-gray-500">Issued: {fmt(date)}</div>}
              </div>

              <div className="mt-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-10">
                <div className="flex flex-col items-start">
                  <img
                    src={resolvedSignature}
                    alt="Prof. Douglas Boateng signature"
                    className="h-14 w-auto object-contain"
                    crossOrigin="anonymous"
                    decoding="async"
                    loading="eager"
                  />
                  <div className="mt-2 h-px bg-gray-400 w-44" />
                  <p className="mt-1 font-medium text-gray-900">{signerName}</p>
                  {signerTitle && <p className="text-xs text-gray-600">{signerTitle}</p>}
                  {date && <p className="text-xs text-gray-500 mt-1">Date: {fmt(date)}</p>}
                </div>

                {provider !== "none" && qrUrl && (
                  <div className="flex flex-col items-center sm:items-end text-right">
                    <p className="text-[10px] text-gray-500 mb-1">Scan to verify</p>
                    <img src={qrUrl} alt="Certificate QR" width={qrSize} height={qrSize} className="inline-block" crossOrigin="anonymous" />
                    <p className="text-[11px] text-gray-700 font-medium mt-2">{resolvedId}</p>
                  </div>
                )}
              </div>

              <div className="mt-6 flex items-center justify-start">
                <img src={panavestLogo} alt="PanAvest" className="h-12 w-auto" crossOrigin="anonymous" />
              </div>
            </div>
          </div>

          {showPrint && (
            <div className="mt-3 flex justify-end relative z-50 pointer-events-auto">
              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={downloading}
                className="rounded px-3 py-1.5 text-xs border hover:bg-gray-50 disabled:opacity-60"
              >
                {downloading ? "Preparing PDF…" : "Download certificate (PDF)"}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }
);

SimpleCertificate.displayName = "SimpleCertificate";
export default SimpleCertificate;