// File: app/ebooks/layout.tsx
// app/ebooks/layout.tsx
export const dynamic = "force-dynamic";

export default function EbooksLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <section className="min-h-screen bg-[color:var(--color-app-bg,white)]">
      {children}
    </section>
  );
}
