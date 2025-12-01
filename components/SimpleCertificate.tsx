// Behaviour: Certificate preview + download per README-upgrade.md. Supports QR providers, DOM capture via html2canvas,
// jsPDF export, and native download (Filesystem + Share). Used in dashboards to preview/download issued and provisional
// certificates. Manual test: on web, click "Download certificate" and ensure a PDF saves; on native, confirm share sheet
// opens and the PDF can be saved; check the tiny QR renders the verify URL when provided.
"use client";

import React, { useCallback, useMemo, useRef } from "react";
import html2canvas from "html2canvas";
import { isNativePlatform, savePdfToDevice } from "@/lib/nativeDownload";

type Props = {
  recipient: string;
  course: string;
  blurb?: string;
  date: string; // ISO string ok
  certId: string;
  signerName?: string;
  signerTitle?: string;
  accent?: string;
  showPrint?: boolean;
  qrValue?: string;
  qrProvider?: "quickchart" | "goqr" | "none" | "img";
};

const QR_SIZE = 120;

function buildQrUrl(value: string, provider: Props["qrProvider"]) {
  if (!value) return null;
  if (provider === "none") return null;
  if (provider === "img") return value; // treat as already-built image URL
  const d = encodeURIComponent(value);
  if (provider === "goqr") return `https://api.qrserver.com/v1/create-qr-code/?size=${QR_SIZE}x${QR_SIZE}&data=${d}&margin=1`;
  return `https://quickchart.io/qr?text=${d}&size=${QR_SIZE}&margin=1`;
}

function triggerDownload(dataUrl: string, fileName: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export default function SimpleCertificate({
  recipient,
  course,
  blurb = "For successfully completing the prescribed curriculum and assessments.",
  date,
  certId,
  signerName = "Prof. Douglas Boateng",
  signerTitle = "D.Prof., FCILT, FIoD, FIOM, FAC, FIAM, FCIPS, FIC",
  accent = "#0a1156",
  showPrint = false,
  qrValue,
  qrProvider = "quickchart",
}: Props) {
  const issued = new Date(date);
  const issuedStr = isNaN(issued.getTime()) ? date : issued.toLocaleDateString();
  const border = { boxShadow: `inset 0 0 0 2px ${accent}20, inset 0 0 0 6px #ffffff, inset 0 0 0 8px ${accent}` };
  const captureRef = useRef<HTMLDivElement | null>(null);
  const resolvedId = certId || "KDS-CERT";
  const resolvedQr = useMemo(() => (qrValue ? buildQrUrl(qrValue, qrProvider) : null), [qrValue, qrProvider]);

  // Manual test: ensure this saves on web (downloads) and native (share sheet) and falls back to PNG on web errors.
  const handleDownloadPdf = useCallback(async () => {
    if (!captureRef.current) return;
    const baseName = resolvedId ? `PanAvest-Certificate-${resolvedId}` : "PanAvest-Certificate";

    let imgData: string | null = null;
    try {
      const canvas = await html2canvas(captureRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        ignoreElements: (el: Element) => {
          const tag = el.tagName?.toLowerCase?.() ?? "";
          return tag === "svg" || tag === "path";
        },
      });
      imgData = canvas.toDataURL("image/png");

      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth - 20;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      const offsetX = (pageWidth - imgWidth) / 2;
      const offsetY = Math.max(10, (pageHeight - imgHeight) / 2);
      pdf.addImage(imgData, "PNG", offsetX, offsetY, imgWidth, imgHeight);

      if (isNativePlatform()) {
        const blob = pdf.output("blob");
        await savePdfToDevice(`${baseName}.pdf`, blob);
      } else {
        pdf.save(`${baseName}.pdf`);
      }
    } catch (pdfErr) {
      console.error("Certificate PDF failed, attempting PNG fallback", pdfErr);
      if (imgData && typeof window !== "undefined" && !isNativePlatform()) {
        triggerDownload(imgData, `${baseName}.png`);
      }
    }
  }, [resolvedId]);

  return (
    <div className="w-full">
      <div
        ref={captureRef}
        className="relative mx-auto max-w-[880px] bg-white rounded-xl p-6 sm:p-8 border"
        style={border}
      >
        {/* Header */}
        <div className="text-center">
          <div className="text-xs tracking-widest text-gray-500">CERTIFICATE OF COMPLETION</div>
          <h2 className="mt-1 text-2xl sm:text-3xl font-extrabold" style={{ color: accent }}>
            Knowledge Development Series
          </h2>
        </div>

        {/* Body */}
        <div className="mt-6 sm:mt-8 grid gap-4 sm:gap-6">
          <p className="text-center text-sm text-gray-600">{blurb}</p>
          <div className="text-center text-2xl sm:text-3xl font-bold">{recipient || "Your Name"}</div>
          <p className="text-center text-sm text-gray-600">has successfully completed</p>
          <div className="text-center text-xl sm:text-2xl font-semibold">{course || "Course Title"}</div>

          <div className="mt-2 flex flex-wrap items-center justify-center gap-6 text-xs text-gray-600">
            <div>
              <span className="font-medium">Certificate No:</span> {resolvedId}
            </div>
            <div>
              <span className="font-medium">Issued:</span> {issuedStr}
            </div>
          </div>
        </div>

        {/* Footer / signatures / QR */}
        <div className="mt-8 sm:mt-10 flex items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="h-[2px] w-40 bg-gray-300" />
            <div className="mt-1 text-xs text-gray-600">Authorized Signatory</div>
            <div className="text-sm font-semibold text-gray-800">{signerName}</div>
            <div className="text-[11px] text-gray-500">{signerTitle}</div>
          </div>

          {resolvedQr ? (
            <div className="text-right">
              <img
                src={resolvedQr}
                alt="QR code"
                className="w-20 h-20 sm:w-24 sm:h-24 border rounded-md"
              />
              <div className="mt-1 text-[10px] text-gray-500">Scan to verify</div>
            </div>
          ) : (
            <div />
          )}
        </div>

        {/* Print/download action */}
        {showPrint && (
          <div className="mt-6 flex flex-wrap gap-3 justify-end">
            <button
              type="button"
              onClick={() => typeof window !== "undefined" && window.print()}
              className="rounded-lg px-4 py-2 text-sm text-white"
              style={{ backgroundColor: accent }}
            >
              Print / Save as PDF
            </button>
            <button
              type="button"
              onClick={handleDownloadPdf}
              className="rounded-lg px-4 py-2 text-sm text-white"
              style={{ backgroundColor: accent }}
            >
              Download certificate
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
