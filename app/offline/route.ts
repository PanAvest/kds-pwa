// File: app/offline/route.ts
export function GET(){
  return new Response(require("fs").readFileSync("public/offline.html"), { headers: { "Content-Type": "text/html" } })
}
