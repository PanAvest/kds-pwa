"use client";

type Props = {
  visible: boolean;
  onRetry: () => void;
};

export default function OfflineOverlay({ visible, onRetry }: Props) {
  return (
    <div
      className={`fixed inset-0 z-[120] flex items-center justify-center transition-opacity duration-200 ${
        visible ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
      }`}
      style={{ backgroundColor: "rgba(20, 16, 14, 0.18)" }}
    >
      <div className="mx-4 max-w-sm rounded-2xl bg-white shadow-xl border border-[color:var(--color-light)] px-6 py-7 text-center space-y-4">
        <div className="mx-auto h-12 w-12 rounded-full bg-[color:var(--color-light)]/80 text-[color:var(--color-text-muted)] grid place-items-center text-2xl font-bold">
          !
        </div>
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-[color:var(--color-text-dark)]">
            Sorry, we cannot connect to the Internet.
          </h2>
          <p className="text-sm text-[color:var(--color-text-muted)]">
            Please check your internet connection and try again.
          </p>
        </div>
        <button
          type="button"
          onClick={onRetry}
          className="w-full rounded-lg bg-[color:var(--color-accent-red)] px-4 py-2.5 text-white font-semibold hover:opacity-90 transition"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
