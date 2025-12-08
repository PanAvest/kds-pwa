<!-- File: docs/ios-payment-audit.md -->
# iOS Payment Audit

## 1. PROJECT OVERVIEW
- **Stack**: Next.js App Router + React (PWA) with Supabase auth/data; Capacitor native shells for mobile (`capacitor.config.ts`, `ios/`, `android/`).
- **PWA location**: Web app lives in the `app/` tree (e.g., `app/courses/...`, `app/ebooks/...`).
- **Capacitor iOS shell**: `ios/App` contains the WKWebView container (`ios/App/App/MainViewController.swift`, `ios/App/App/AppDelegate.swift`). The WebView loads the remote Next.js app defined in `capacitor.config.ts:3-15` (`server.url` = `NEXT_PUBLIC_APP_URL` or default `https://kds-pwa.vercel.app`; HTTPS enforced, `androidScheme: "https"`). WKWebView is bridged via Capacitor and custom splash/toolbar code.

## 2. PLATFORM / IOS DETECTION
- **Capacitor detection helper**: `lib/nativeDownload.ts:8-10` exposes `isNativePlatform()` using `Capacitor.isNativePlatform()` (true on any Capacitor native runtime, iOS or Android). Used by certificate download flows.
- **Shared platform helpers**: `lib/platform.ts` provides SSR-safe `isNativeApp()` and `isIOSApp()` using guarded `Capacitor.isNativePlatform()` + `Capacitor.getPlatform() === "ios"`. These are used by client components to branch iOS-native UX.
- **Web↔︎native ready signal**: `app/ReadySignal.tsx:5-10` sets `window.__KDS_WEB_READY` and dispatches `kdsWebReady`. Native injects a WKUserScript listening for that event and posts a message handler (`ios/App/App/MainViewController.swift:321-345`), mainly to hide the native splash.
- **Most reliable current indicator**: Inside React, the consistent signal of running in the native shell is `Capacitor.isNativePlatform()`, combined with `Capacitor.getPlatform() === "ios"` via `isIOSApp()` when an iOS-only branch is needed.

## 3. PAYMENT & PAYSTACK ENTRY POINTS
- **Course enrollment screen**: `app/courses/[slug]/enroll/page.tsx:83-157` verifies Paystack return, calls `/api/payments/paystack/init`, then `window.location.replace(authorization_url)`. UI button: “Pay with Paystack”. Reached via the “Enroll” CTA on course previews.
- **Course preview CTA**: `components/EnrollCTA.tsx:52-80` links signed-out users to sign-in → course page; enrolled users to dashboard; others to `/courses/[slug]/enroll` (entry to payment).
- **E-book detail**: `app/ebooks/[slug]/page.tsx:150-243` checks ownership and starts Paystack via `handleBuy` → `/api/payments/paystack/init` → `window.location.replace(...)`; verification/polling on return (`:167-207`). UI buttons: “Sign in to buy”, “Buy • <price>”.
- **API routes**:
  - Init: `app/api/payments/paystack/init/route.ts:1-66` (course/ebook metadata, callback URL, hits Paystack initialize).
  - Verify: `app/api/payments/paystack/verify/route.ts:1-55` (Paystack verify, upserts enrollments/ebook_purchases).
  - Webhook: `app/api/payments/paystack/webhook/route.ts:1-80` (signature check, upserts enrollments/ebook_purchases, logs payment).
- **Other references**: `app/head.tsx:13-16` preconnects to `api.paystack.co`.

## 4. IN-APP CTAs TO PAY OR EXTERNAL WEBSITES
- **E-book listing copy**: `app/ebooks/page.tsx:68-71` — “Buy to unlock reading. Your purchases appear in the Dashboard.”
- **Course preview**: `components/EnrollCTA.tsx:52-80` — “Sign in to Enroll” / “Enroll” buttons linking to the enrollment (payment) flow.
- **Course enroll page**: `app/courses/[slug]/enroll/page.tsx:139-158` — “Pay once to unlock this course…” + “Pay with Paystack” button (opens Paystack checkout).
- **E-book detail**: `app/ebooks/[slug]/page.tsx:430-470` — “Sign in to buy” link and “Buy • <price>” button triggering Paystack; verification notice “Verifying payment…”.
- **No other explicit checkout links**: No external payment URLs beyond Paystack checkout redirects from the above components.

## 5. EBOOK / COURSE UNLOCK LOGIC
- **Courses**:
  - Enrollment check for dashboards: `app/courses/[slug]/dashboard/page.tsx:202-221` queries `enrollments` for `paid === true`; otherwise redirects to `/courses/[slug]/enroll`.
  - Preview CTA: `components/EnrollCTA.tsx:23-40` checks `enrollments` for the current user/course to decide CTA.
  - Paystack verify/webhook update `enrollments` (`verify route lines 25-36`, `webhook lines 33-54`).
- **E-books**:
  - Ownership check in UI: `app/ebooks/[slug]/page.tsx:150-200` reads `ebook_purchases.status === "paid"` to show buy/read states.
  - Secure PDF delivery: `app/api/ebooks/secure-pdf/route.ts:18-86` validates bearer token, ensures `ebook_purchases.status === "paid"`, then streams the PDF.
  - Dashboard display: `app/dashboard/page.tsx:392-407` fetches `ebook_purchases` with `status = 'paid'`.
  - Paystack verify/webhook update `ebook_purchases` (`verify lines 37-48`, `webhook lines 54-68`).
- **Tables involved**: `enrollments` (course access), `ebook_purchases` (ebook access), plus read-only course/ebook metadata tables (`courses`, `ebooks`).

## 6. SUMMARY & RECOMMENDATION FOR OPTION B
- **Proposed helper**: Add a reusable `isIOSApp()` (e.g., `lib/platform.ts`) that guards SSR, then returns `Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios"` (fallback to `false` if Capacitor is undefined). This aligns with the existing Capacitor runtime and differentiates iOS from Android/web.
- **Entry points to guard on iOS (hide/disable Paystack flows)**:
  - `components/EnrollCTA.tsx` (remove/replace “Enroll” → payment entry).
  - `app/courses/[slug]/enroll/page.tsx` (Paystack init/redirect).
  - `app/ebooks/[slug]/page.tsx` (buy/sign-in-to-buy buttons and verification UI).
  - `app/ebooks/page.tsx` marketing copy that nudges purchase.
  - API calls from iOS to `/api/payments/paystack/*` should be blocked or no-op when `isIOSApp()` is true.
- **Display-only views to keep on iOS**: course dashboards for already-paid users, ebook reader for owners, lists/detail pages without purchase CTAs, and certificate/download flows (native download already checks `isNativePlatform`).

## 7. iOS App – Access Only (Apple Guideline 3.1.1)
- `lib/platform.ts` adds SSR-safe `isNativeApp()` + `isIOSApp()` and is used in client components to branch iOS-native UX.
- On iOS native, the app is access-only: it lets learners sign in and consume courses/ebooks they already obtained through KDS Learning on other platforms. Purchases and checkout flows are disabled in-app.
- Web/Android behaviour is unchanged; Paystack flows remain available there.

### Paystack Guard Verification
- Paystack initiation/CTA guards now live in: `components/EnrollCTA.tsx`, `app/courses/[slug]/enroll/page.tsx`, `app/ebooks/page.tsx`, `app/ebooks/[slug]/page.tsx`.
- These components call `isIOSApp()` to suppress purchase CTAs and block any Paystack init on iOS native. No iOS-native path calls `/api/payments/paystack/*` or opens Paystack checkout.

### Access flows on iOS
- Courses: enrolled users still see “Go to Dashboard” from course previews (`components/EnrollCTA.tsx`), and course dashboards remain reachable when already enrolled.
- E-books: owners see “Read now” in `app/ebooks/[slug]/page.tsx`; the secure PDF reader continues to work for paid accounts.
- Non-owners on iOS see neutral access-only messaging with no buy buttons; they can sign in with existing KDS Learning accounts to access prior purchases.

### App Store Review Note (copy-paste)
> In this version, the KDS Learning iOS app has been updated to comply with Guideline 3.1.1. The iOS build is now access-only: it does not offer in-app purchases or initiate any external payment flows. All Paystack-based purchases for courses and ebooks occur on our web and other platforms. The iOS app’s role is to let learners sign in and access digital content they have already obtained through KDS Learning. We have also confirmed that existing paid users can still access their courses and ebooks on iOS, while non-paid users see neutral informational messaging without any “buy” buttons or checkout links.
