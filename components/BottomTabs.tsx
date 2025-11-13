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
        fixed
        md:hidden
        left-0
        right-0
        /* raise a bit above the very bottom and fill safe area */
        bottom-[env(safe-area-inset-bottom)]
        border-t border-[var(--color-soft)]
        bg-white
        z-40
      "
    >
      <ul className="grid grid-cols-4">
        {items.map((it) => {
          const Icon = it.icon;
          const active =
            p === it.href || (it.href !== "/" && p?.startsWith(it.href));
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                className={`flex flex-col items-center justify-center py-2 text-xs ${
                  active ? "text-[var(--color-accent-red)]" : "text-gray-600"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span>{it.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
