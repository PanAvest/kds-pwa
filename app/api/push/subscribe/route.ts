// File: app/api/push/subscribe/route.ts
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const runtime = "edge"
export async function POST(req: Request){
  // Expected: { token }
  // Store in Supabase push_subscriptions with current user id (from cookies/session)
  const body = await req.json().catch(()=>({}))
  return new Response(JSON.stringify({ ok: true, received: !!body.token }), { headers: { "content-type":"application/json" } })
}
