export default function Head() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const supabaseOrigin = supabaseUrl ? new URL(supabaseUrl).origin : "";

  return (
    <>
      <title>KDS Learning</title>
      <meta name="description" content="Browse → Enroll → Learn → Assess → Certify" />
      <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
      <link rel="manifest" href="/manifest.json" />
      <link rel="icon" href="/icon-192.png" />

      {/* Small perf wins: warm up DNS/TLS to Supabase API + Paystack CDN */}
      {supabaseOrigin && <link rel="preconnect" href={supabaseOrigin} />}
      <link rel="dns-prefetch" href="https://api.paystack.co" />
      <link rel="preconnect" href="https://api.paystack.co" />
    </>
  );
}
