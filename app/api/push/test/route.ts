// File: app/api/push/test/route.ts
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const runtime = "edge"
export async function POST(){
  // In production: Use FCM server SDK (or calls through your backend) to send.
  return new Response(JSON.stringify({ ok: true, note: "Server would send FCM push to current user subscriptions." }), { headers: { "content-type":"application/json" } })
}
