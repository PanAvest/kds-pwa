"use client"

import Image from "next/image"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { supabase } from "@/lib/supabaseClient"
import { Button } from "@/components/ui/button"
import { isNativeApp, isNativeIOSApp } from "@/lib/nativePlatform"

type Course = {
  id: string
  slug: string
  title: string
  description: string | null
  img: string | null
  cpd_points: number | null
  published: boolean | null
}

type Ebook = {
  id: string
  slug: string
  title: string
  description: string | null
  cover_url: string | null
  price_cents: number | null
  published: boolean | null
}

const BRAND = {
  primary: "#b65437",
}

const safeSrc = (src?: string | null) => (src && src.trim() ? src : "/icon-512.png")

export default function HomePage() {
  const [courses, setCourses] = useState<Course[]>([])
  const [ebooks, setEbooks] = useState<Ebook[]>([])
  const [loading, setLoading] = useState(true)

  // Auth state for greeting + buttons
  const [user, setUser] = useState<any>(null)
  const [fullName, setFullName] = useState<string>("")
  const nameMissing = !fullName?.trim()
  const isNative = useMemo(() => isNativeApp(), [])
  const isNativeIOS = useMemo(() => isNativeIOSApp(), [])

  useEffect(() => {
    let alive = true

    ;(async () => {
      try {
        // Fetch in parallel so home loads faster
        const [coursesRes, ebooksRes] = await Promise.allSettled([
          supabase
            .from("courses")
            .select("id, slug, title, description, img, cpd_points, published, created_at")
            .eq("published", true)
            .order("created_at", { ascending: false })
            .limit(6),
          supabase
            .from("ebooks")
            .select("id, slug, title, description, cover_url, price_cents, published, created_at")
            .eq("published", true)
            .order("created_at", { ascending: false })
            .limit(8),
        ])

        if (!alive) return

        if (coursesRes.status === "fulfilled") {
          setCourses((coursesRes.value.data ?? []) as Course[])
        } else {
          console.error("Failed to load courses", coursesRes.status === "rejected" ? coursesRes.reason : "unknown")
          setCourses([])
        }

        if (ebooksRes.status === "fulfilled") {
          setEbooks((ebooksRes.value.data ?? []) as Ebook[])
        } else {
          console.error("Failed to load ebooks", ebooksRes.status === "rejected" ? ebooksRes.reason : "unknown")
          setEbooks([])
        }
      } finally {
        if (alive) setLoading(false)
      }
    })()

    return () => {
      alive = false
    }
  }, [])

  // Load auth + profile
  useEffect(() => {
    let cancelled = false

    async function loadUser() {
      const { data } = await supabase.auth.getUser()
      if (cancelled) return
      const u = data.user ?? null
      setUser(u)

      if (u?.id) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", u.id)
          .maybeSingle()
        if (!cancelled) setFullName((prof?.full_name ?? "").trim())
      } else {
        setFullName("")
      }
    }

    loadUser()

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (cancelled) return
      const u = session?.user ?? null
      setUser(u)
      if (u?.id) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", u.id)
          .maybeSingle()
        if (!cancelled) setFullName((prof?.full_name ?? "").trim())
      } else {
        setFullName("")
      }
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [])

  const featured = useMemo(() => courses.slice(0, 6), [courses])
  const featuredList: (Course | null)[] = loading ? Array.from({ length: 3 }, () => null) : featured
  const ebooksList: (Ebook | null)[] = loading ? Array.from({ length: 4 }, () => null) : ebooks

  // Inline SVG icons (no emojis)
  const Icon = {
    Check: () => (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
        <path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" />
      </svg>
    ),
    Beaker: () => (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
        <path d="M9 3v2l-4.6 7.7A5 5 0 0 0 9 22h6a5 5 0 0 0 4.6-9.3L15 5V3H9zm1.7 6h4.6l2.2 3.7A3 3 0 0 1 15 20H9a3 3 0 0 1-2.5-4.6L10.7 9z" />
      </svg>
    ),
    Shield: () => (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
        <path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3z" />
      </svg>
    ),
    Cap: () => (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor">
        <path d="M12 3 2 8l10 5 9-4.5V15h2V8L12 3zm0 13-6-3v4l6 3 6-3v-4l-6 3z" />
      </svg>
    ),
    Building: () => (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor">
        <path d="M3 22h18v-2H3v2zM19 2H5v16h14V2zm-9 3h2v2h-2V5zm0 4h2v2h-2V9zm0 4h2v2h-2v-2zm5-8h2v2h-2V5zm0 4h2v2h-2V9zm0 4h2v2h-2v-2z" />
      </svg>
    ),
    Chart: () => (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor">
        <path d="M3 3h2v18H3V3zm16 18h2V9h-2v12zM11 21h2V13h-2v8zM7 21h2V7H7v14zM15 21h2V3h-2v18z" />
      </svg>
    ),
    Books: () => (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor">
        <path d="M4 3h6a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4V3zm0 16h6a2 2 0 0 1 2 2H6a2 2 0 0 1-2-2zm10-16h6v16h-6a2 2 0 0 0-2 2V5a2 2 0 0 1 2-2z" />
      </svg>
    ),
  }

  return (
    <>
      {/* ===== HERO (mobile-first) ===== */}
      <section className="px-4 sm:px-6 lg:px-8 py-10 sm:py-14 lg:py-20">
        <div className="mx-auto max-w-screen-2xl grid gap-10 md:grid-cols-2 lg:grid-cols-[1.08fr_.92fr] items-center">
          {/* Left copy */}
          <div>
            {/* Greeting + Auth buttons (replacing header, above KDS is powered...) */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col leading-tight">
                <span className="text-sm sm:text-base font-semibold text-[color:var(--color-text-dark)]">
                  {user
                    ? nameMissing
                      ? "Welcome"
                      : `Welcome, ${fullName}`
                    : "Welcome to KDS Learning"}
                </span>
                {user && nameMissing && (
                  <Link
                    href="/dashboard"
                    className="text-[12px] text-[color:var(--color-text-muted)]"
                  >
                    Add your full name on the Dashboard
                  </Link>
                )}
              </div>

              <div className="flex items-center gap-2">
                {user ? (
                  <Button
                    variant="outline"
                    className="text-xs sm:text-sm px-3"
                    onClick={() => supabase.auth.signOut()}
                  >
                    Sign out
                  </Button>
                ) : (
                  <>
                    <Link href="/auth/sign-in">
                      <Button variant="outline" className="text-xs sm:text-sm px-3">
                        Sign In
                      </Button>
                    </Link>
                    <Link href="/auth/sign-up">
                      <Button className="text-xs sm:text-sm px-3">
                        Sign Up
                      </Button>
                    </Link>
                  </>
                )}
              </div>
            </div>

            {/* “KDS is powered…” pill */}
            <span className="mt-4 inline-flex items-center gap-2 rounded-full border border-[color:var(--color-light)] bg-white/70 px-3 py-1 text-xs">
              <span className="h-2 w-2 rounded-full" style={{ background: BRAND.primary }} />
              KDS is powered by <b>PanAvest International &amp; Partners</b>
            </span>

            <h1 className="mt-4 font-extrabold leading-[1.02] text-[clamp(2.25rem,4vw,3.5rem)]">
              Learn. <span style={{ color: BRAND.primary }}>Assess.</span> Excel.
            </h1>
            <p className="mt-3 sm:mt-4 text-[15px] sm:text-[17px] text-[color:var(--color-text-muted)] max-w-2xl">
              Certified CPD (CPPD) pathways for modern professionals — industry-aligned modules, interactive
              assessments, and verifiable certificates.
            </p>

            {isNativeIOS && (
              <div className="mt-4 mb-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-[0_8px_24px_-16px_rgba(0,0,0,0.25)]">
                <div className="text-xs font-semibold uppercase tracking-wide text-amber-800">PanAvest KDS mobile access</div>
                <p className="mt-1 leading-relaxed">
                  This mobile app is a companion viewer for the PanAvest KDS platform. Sign in to access programs, knowledge modules, certificates, and e-books already on your account. New enrollments and payments are completed on the web portal at <span className="font-semibold">www.panavestkds.com</span>.
                </p>
              </div>
            )}

            {/* CTA buttons removed as requested */}

            {/* trust pills */}
            <div className="mt-7 flex flex-wrap items-center gap-3 text-xs text-[color:var(--color-text-muted)]">
              <span className="inline-flex items-center gap-2 rounded-lg bg-white/70 ring-1 ring-[color:var(--color-light)] px-3 py-1">
                <Icon.Check /> Certified CPD (CPPD)
              </span>
              <span className="inline-flex items-center gap-2 rounded-lg bg-white/70 ring-1 ring-[color:var(--color-light)] px-3 py-1">
                <Icon.Beaker /> Rigorous assessments
              </span>
              <span className="inline-flex items-center gap-2 rounded-lg bg-white/70 ring-1 ring-[color:var(--color-light)] px-3 py-1">
                <Icon.Shield /> Verifiable certificates
              </span>
            </div>

            {/* Nyansakasa quote */}
            <figure className="mt-7">
              <blockquote className="text-[15px] sm:text-[17px] leading-relaxed text-[color:var(--color-text-muted)]">
                <span className="mt-1 block italic">
                  “What you plant in your mind grows in your life.”
                </span>
                <span className="block font-semibold text-[color:var(--color-text-dark)]">
                  — Prof. Douglas Boateng
                </span>
              </blockquote>
            </figure>
          </div>

          {/* Right visual */}
          {/* (add or keep empty as you had before) */}
        </div>
      </section>

      {/* ===== WHAT WE DO ===== */}
      <section className="bg-white py-10 sm:py-14">
        <div className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between gap-4">
            <h2 className="text-2xl sm:text-3xl font-bold">What we do</h2>
            <Link href="/about" className="text-sm underline decoration-dotted underline-offset-4">
              About KDS
            </Link>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {[
              {
                Icon: Icon.Cap,
                title: "Certified CPD (CPPD)",
                text: "Professional knowledge with verifiable certificates.",
              },
              {
                Icon: Icon.Beaker,
                title: "Assessments",
                text: "Rigorous evaluations that prove capability.",
              },
              {
                Icon: Icon.Building,
                title: "Corporate Training",
                text: "Tailored programs delivered to teams.",
              },
              {
                Icon: Icon.Chart,
                title: "Career Acceleration",
                text: "Job-ready, practical skill-building.",
              },
              {
                Icon: Icon.Books,
                title: "Publications",
                text: "Unique compendiums credited by NaCCA.",
              },
            ].map((i) => (
              <div
                key={i.title}
                className="rounded-2xl bg-white border border-[color:var(--color-light)] p-5 hover:shadow-sm transition"
              >
                <div className="text-3xl text-[color:var(--color-text-muted)]">
                  <i.Icon />
                </div>
                <div className="mt-3 font-semibold">{i.title}</div>
                <p className="mt-1 text-sm text-[color:var(--color-text-muted)]">{i.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {!isNative && (
        <>
          {/* ===== FEATURED KNOWLEDGE ===== */}
          <section className="py-10 sm:py-14">
            <div className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8">
              <div className="flex items-end justify-between gap-4">
                <h2 className="text-2xl sm:3xl font-bold">Featured Knowledge</h2>
                <Link href="/courses" className="text-sm underline decoration-dotted underline-offset-4">
                  Browse all knowledge
                </Link>
              </div>

              <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {featuredList.map((c, idx) => (
                  <Link
                    key={c ? c.id : `s-${idx}`}
                    href={c ? `/courses/${c.slug}` : "#"}
                    className="group rounded-2xl bg-white border border-[color:var(--color-light)] hover:shadow-md transition overflow-hidden"
                  >
                  <div className="relative w-full aspect-video bg-[color:var(--color-light)]/40">
                    {c?.img ? (
                      <Image
                        src={safeSrc(c.img)}
                        alt={c.title}
                        fill
                        priority
                        loading="eager"
                        sizes="(max-width:1024px) 50vw, 33vw"
                        className="object-cover"
                      />
                    ) : (
                      <Image
                        src={safeSrc(null)}
                        alt="Placeholder"
                        fill
                        priority
                        loading="eager"
                        sizes="(max-width:1024px) 50vw, 33vw"
                        className="object-contain p-8"
                      />
                    )}
                  </div>
                    <div className="px-5 py-4">
                      <h3 className="font-semibold text-[17px] text-[color:var(--color-text-dark)] group-hover:opacity-90">
                        {c?.title ?? "Loading…"}
                      </h3>
                      <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                        CPPD Score: <b>{c?.cpd_points ?? 0}</b>
                      </div>
                      {c?.description && (
                        <p className="mt-2 text-sm text-[color:var(--color-text-muted)] line-clamp-2">
                          {c.description}
                        </p>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        </>
      )}

      {!isNative && (
        <>
          {/* ===== E-BOOKS ===== */}
          <section className="bg-white py-10 sm:py-14">
            <div className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-2xl sm:text-3xl font-bold">E-Books</h2>
                  <p className="text-sm text-[color:var(--color-text-muted)]">
                    All books are credited by the{" "}
                    <span className="font-semibold">
                      National Council for Curriculum and Assessment (NaCCA) of Ghana
                    </span>
                    .
                  </p>
                </div>
                <Link href="/ebooks" className="text-sm underline decoration-dotted underline-offset-4">
                  View all e-books
                </Link>
              </div>

              <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                {ebooksList.map((b, idx) => (
                  <Link
                    key={b ? b.id : `e-${idx}`}
                    href={b ? `/ebooks/${b.slug}` : "#"}
                    className="group relative rounded-2xl ring-1 ring-[color:var(--color-light)] bg-white overflow-hidden hover:shadow-lg transition"
                  >
                    <div className="relative">
                      <div className="relative w-full h-[280px] bg-[color:var(--color-light)]/40">
                        {b?.cover_url ? (
                          <Image
                            src={safeSrc(b.cover_url)}
                            alt={b.title}
                            fill
                            priority={idx < 2}
                            loading={idx < 2 ? "eager" : undefined}
                            sizes="(max-width:640px) 100vw, (max-width:1024px) 50vw, 25vw"
                            className="object-cover"
                          />
                        ) : (
                          <Image
                            src={safeSrc(null)}
                            alt="Placeholder"
                            fill
                            priority={idx < 2}
                            loading={idx < 2 ? "eager" : undefined}
                            sizes="(max-width:640px) 100vw, (max-width:1024px) 50vw, 25vw"
                            className="object-contain p-10"
                          />
                        )}
                      </div>
                      <div className="absolute left-3 top-3 rounded-md px-2 py-1 text-[10px] font-semibold text-white bg-black/75">
                        NaCCA-credited
                      </div>
                    </div>
                    <div className="p-4">
                      <div className="min-h-[52px]">
                        <h3 className="font-semibold leading-tight">
                          {b?.title ?? "Loading…"}
                        </h3>
                      </div>
                      {b?.description && (
                        <p className="mt-2 text-sm text-[color:var(--color-text-muted)] line-clamp-3">
                          {b.description}
                        </p>
                      )}
                      {typeof b?.price_cents === "number" && (
                        <div className="mt-3">
                          <code className="rounded-md bg-[color:var(--color-light)]/40 px-2 py-1 text-[12px]">
                            GH₵ {(b.price_cents / 100).toFixed(2)}
                          </code>
                        </div>
                      )}
                    </div>
                  </Link>
                ))}
              </div>

              <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs text-[color:var(--color-text-muted)]">
                  * Accreditation and curriculum crediting provided by NaCCA (Ghana).
                </div>
                <div className="text-xs">
                  <span className="rounded-full bg-white ring-1 ring-[color:var(--color-light)] px-3 py-1">
                    Powered by <b>PanAvest International &amp; Partners</b>
                  </span>
                </div>
              </div>
            </div>
          </section>
        </>
      )}

      {/* ===== REVIEWS ===== */}
      <section className="py-10 sm:py-14">
        <div className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl font-bold">What professionals say</h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                name: "Dr. Ama Mensah",
                role: "Supply Chain Executive",
                org: "Accra, Ghana",
                quote:
                  "PanAvest’s practical approach to governance and procurement is filling a real skills gap across Africa.",
              },
              {
                name: "Michael Ofori",
                role: "Director, Corporate Governance",
                org: "Johannesburg, South Africa",
                quote:
                  "Prof. Boateng’s insights sharpen strategy while grounding teams in measurable execution.",
              },
              {
                name: "Nadia Benali",
                role: "Operations & Projects Lead",
                org: "Casablanca, Morocco",
                quote:
                  "The CPPD-aligned learning paths are exactly what our managers needed to level up—fast.",
              },
              {
                name: "Kofi Asiedu",
                role: "Head of Procurement",
                org: "Kumasi, Ghana",
                quote:
                  "Clear, rigorous and immediately applicable. We saw better sourcing decisions within weeks.",
              },
            ].map((r) => (
              <div
                key={r.name}
                className="rounded-2xl bg-white border border-[color:var(--color-light)] p-5 hover:shadow-sm transition"
              >
                <p className="text-sm text-[color:var(--color-text-muted)] leading-relaxed">
                  “{r.quote}”
                </p>
                <div className="mt-4 text-sm font-semibold text-[color:var(--color-text-dark)]">
                  {r.name}
                </div>
                <div className="text-xs text-[color:var(--color-text-muted)]">
                  {r.role} • {r.org}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
