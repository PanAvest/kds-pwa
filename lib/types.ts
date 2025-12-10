// File: lib/types.ts
export type Course = {
  id: string
  slug: string
  title: string
  description: string
  price: number
  currency: string
  cpd_points: number
  img?: string
  published: boolean
  coming_soon?: boolean | null
}

export type Ebook = {
  id: string
  slug: string
  title: string
  description: string
  cover_url?: string
  price_cents: number
  published: boolean
}
