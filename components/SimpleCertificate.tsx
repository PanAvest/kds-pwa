"use client";

import React from "react";

type Props = {
  recipient: string;
  course: string;
  date: string;                 // ISO string ok
  certId: string;
  accent?: string;              // brand color, default #0a1156
  showPrint?: boolean;
  /** If provided, a QR will show that points to this value */
  qrValue?: string;
  /** Set to "none" to hide the QR even if qrValue is provided */
  qrProvider?: "img" | "none";
};

export default function SimpleCertificate({
  recipient,
  course,
  date,
  certId,
  accent = "#0a1156",
  showPrint = false,
  qrValue,
  qrProvider = "img",
}: Props) {
  const issued = new Date(date);
  const issuedStr = isNaN(issued.getTime()) ? date : issued.toLocaleDateString();

  const cardStyle: React.CSSProperties = {
    width: "210mm",
    maxWidth: "100%",
    aspectRatio: "210 / 297",
    background: "#fff",
    borderRadius: "16px",
    padding: "32px",
    margin: "0 auto",
    boxShadow: "0 12px 35px rgba(0,0,0,0.08), inset 0 0 0 2px rgba(0,0,0,0.04)",
  };

  const border = { boxShadow: `inset 0 0 0 2px ${accent}20, inset 0 0 0 6px #ffffff, inset 0 0 0 8px ${accent}` };

  const handlePrint = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  return (
    <div className="w-full">
      <div className="kds-cert-print-root" style={{ ...cardStyle, ...border }}>
        {/* Header */}
        <div className="text-center">
          <div className="text-xs tracking-widest text-gray-500">CERTIFICATE OF COMPLETION</div>
          <h2 className="mt-1 text-2xl sm:text-3xl font-extrabold" style={{ color: accent }}>
            Knowledge Development Series
          </h2>
        </div>

        {/* Body */}
        <div className="mt-6 sm:mt-8 grid gap-4 sm:gap-6">
          <p className="text-center text-sm text-gray-600">This is to certify that</p>
          <div className="text-center text-2xl sm:text-3xl font-bold">{recipient || "Your Name"}</div>
          <p className="text-center text-sm text-gray-600">has successfully completed</p>
          <div className="text-center text-xl sm:text-2xl font-semibold">{course || "Course Title"}</div>

          <div className="mt-2 flex flex-wrap items-center justify-center gap-6 text-xs text-gray-600">
            <div>
              <span className="font-medium">Certificate No:</span> {certId}
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
          </div>

          {qrProvider !== "none" && qrValue ? (
            <div className="text-right">
              {/* lightweight QR via public API; fine for preview. Replace with local QR if needed */}
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(qrValue)}`}
                alt="QR code"
                className="w-20 h-20 sm:w-24 sm:h-24 border rounded-md"
              />
              <div className="mt-1 text-[10px] text-gray-500">Scan to verify</div>
            </div>
          ) : (
            <div />
          )}
        </div>
      </div>

      {showPrint && (
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={handlePrint}
            className="rounded-lg px-4 py-2 text-sm text-white"
            style={{ backgroundColor: accent }}
          >
            Print / Save as PDF
          </button>
        </div>
      )}

      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .kds-cert-print-root,
          .kds-cert-print-root * {
            visibility: visible;
          }
          .kds-cert-print-root {
            position: absolute;
            inset: 0;
            margin: 0;
            border-radius: 0;
            box-shadow: none !important;
          }
        }
      `}</style>
    </div>
  );
}
