"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, Book, Library, LayoutDashboard } from "lucide-react"

export default function BottomTabs(){
  const p = usePathname()
  const items = [
    { href: "/", label: "Home", icon: Home },
    { href: "/courses", label: "Programs", icon: Book },
    { href: "/ebooks", label: "E-Books", icon: Library },
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  ]
  return <nav className="fixed md:hidden bottom-0 left-0 right-0 border-t border-[var(--color-soft)] bg-white">
    <ul className="grid grid-cols-4">
      {items.map(it=>{
        const Active = p===it.href
        const Icon = it.icon
        return <li key={it.href}>
          <Link href={it.href} className={"flex flex-col items-center py-2 " + (Active?"text-[var(--color-accent-red)]":"text-[var(--color-text-muted)]")}>
            <Icon className="w-5 h-5" />
            <span className="text-xs">{it.label}</span>
          </Link>
        </li>
      })}
    </ul>
  </nav>
}
