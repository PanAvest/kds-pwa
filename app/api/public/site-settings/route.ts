// File: app/api/public/site-settings/route.ts
export const runtime = "edge"
export const revalidate = 3600

export async function GET() {
  return new Response(
    JSON.stringify({
      brand: { name: "KDS", primary: "#b65437", accent: "#f5b750" },
      features: { ebooks: true, courses: true },
    }),
    {
      headers: {
        "content-type": "application/json",
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    }
  )
}
