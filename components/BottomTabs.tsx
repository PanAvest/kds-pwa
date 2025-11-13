"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Book, Library, LayoutDashboard } from "lucide-react";

export default function BottomTabs() {
  const p = usePathname();

  const items = [
    { href: "/", label: "Home", icon: Home },
    { href: "/courses", label: "Programs", icon: Book },
    { href: "/ebooks", label: "E-Books", icon: Library },
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }
  ];

  return (
    <nav
      className="
        fixed md:hidden left-0 right-0 bottom-0
        border-t border-[var(--color-soft)]
        bg-[var(--color-bg)]
        z-50
      "
      style={{
        paddingBottom: "calc(env(safe-area-inset-bottom) + 18px)", // ⬆ EXTRA RAISE
        paddingTop: "8px"
      }}
    >
      <ul className="grid grid-cols-4">
        {items.map((it) => {
          const Icon = it.icon;
          const active =
            p === it.href ||
            (it.href !== "/" && p?.startsWith(it.href));

          return (
            <li key={it.href}>
              <Link
                href={it.href}
                className={`
                  flex flex-col items-center justify-center
                  pt-1 pb-2
                  text-[11px]
                  ${active ? "text-[var(--color-accent-red)]" : "text-gray-600"}
                `}
              >
                <Icon className="h-5 w-5 mb-0.5" />
                <span>{it.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
