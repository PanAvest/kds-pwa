export const runtime = "edge"
export async function POST(){
  // In production: Use FCM server SDK (or calls through your backend) to send.
  return new Response(JSON.stringify({ ok: true, note: "Server would send FCM push to current user subscriptions." }), { headers: { "content-type":"application/json" } })
}
