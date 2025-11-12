export const dynamic = 'force-dynamic'
export const revalidate = 0
export const runtime = "edge"
export async function GET(){
  return new Response(JSON.stringify({
    brand: { name: "KDS", primary: "#b65437", accent: "#f5b750" },
    features: { ebooks: true, courses: true }
  }), { headers: { "content-type": "application/json" } })
}
