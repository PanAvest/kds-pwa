<!-- File: README-upgrade.md -->
# KDS PWA Tech Notes — Interactive, Dashboard, Certificates, Native Downloads

Canonical reference for how the PWA mirrors the main site (PanAvest) and how to upgrade without guessing. Focus areas: interactive courses, dashboard/data flow, certificates, and native app PDF downloads.

## 1) Big Picture (what we did and why)
- Interactive courses now load from the same static packages the main site uses (PWA origin instead of main-site origin) and expose a tiny debug line to show the resolved interactive URL.
- The PWA dashboard logic was aligned with the main site: enrollments + slide-based progress, quiz history, purchased e‑books, certificates, and provisional certificates.
- Certificate rendering uses `SimpleCertificate` previews plus a `downloadCertPdf` helper that builds a jsPDF layout; names come from `profiles.full_name`; QR codes point to the verify URL.
- Native app certificate download needs a Filesystem + Share flow (browser `save()` works; Capacitor `Browser.open(blob:)` does not). Plan captured below.

## 2) Interactive Courses
- Package location (PWA): `public/interactive/ghie-business-ethics` (drop new courses here under `public/interactive/<course-key>`).
- Expected runtime URL: `https://kds-pwa.vercel.app/interactive/ghie-business-ethics/index.html` (or equivalent entry file).
- Interactive mapping lives in `app/knowledge/[slug]/dashboard/page.tsx`. Build URLs against the PWA origin, not `NEXT_PUBLIC_MAIN_SITE_ORIGIN`.
- Dev helper: near the computed `interactiveUrl`, we render a thin line showing the URL:
  ```tsx
  {interactiveUrl && (
    <p className="mt-2 text-[10px] text-gray-500">
      Current interactive URL: <span className="font-mono break-all">{interactiveUrl}</span>
    </p>
  )}
  ```
  Safe to remove later; useful to confirm paths.

## 3) Dashboard & Data Flow (PWA aligned to main site)
Key tables (Supabase):
- `profiles`: `full_name` powers certificate names.
- `courses`: `slug`, `title`, `img`, `cpd_points`.
- `enrollments`: join to courses; legacy `progress_pct` ignored in favor of slides.
- `course_chapters`, `course_slides`, `user_slide_progress`: compute progress = slides_done / total.
- `ebook_purchases` (status = "paid") + `ebooks`.
- `user_chapter_quiz`: quiz history per chapter.
- `exams`, `attempts`: exam scores and pass status.
- `certificates`: `id`, `user_id`, `course_id`, `attempt_id` (nullable), `certificate_no` (optional), `issued_at`.

Dashboard behaviour:
- Auth gate mirrors main site; then loads profile, enrollments, e‑books, quiz history.
- Progress: aggregate slides per course, then compute pct (cap at 100).
- Quiz section: groups `user_chapter_quiz` by `course_id`; chapter meta from `course_chapters`.
- Certificates:
  - Fetch certificates (with `courses:course_id(...)` join where possible); hydrate missing course meta via `courses`.
  - Generate `certificate_no` when absent: `KDS-${userId.slice(0, 8).toUpperCase()}-${courseId?.slice(0, 6).toUpperCase() ?? ""}`.
  - Score from `attempts` linked by `attempt_id`.
  - Verify URL default: `${origin}/verify?cert_id=${encodeURIComponent(cert.id)}` where `origin` falls back to `https://kdslearning.com` serverside.
- Provisional certificates:
  - Conditions: progress >= 100% (slides) AND latest passing exam attempt (passed && score >= pass_mark) AND no certificate row yet.
  - Shown with provisional status and a `SimpleCertificate` preview (QR off).

## 4) Certificate Rendering Components
- `components/SimpleCertificate.tsx` (PWA): props include `recipient`, `course`, `certId`, `date`, `qrValue`, `qrProvider` (`"quickchart" | "goqr" | "none" | "img"`), `showPrint`.
- QR URL builder swaps providers; `"none"` skips QR.
- `html2canvas` capture uses `ignoreElements` to skip SVG/path (prevents “Problem parsing d=…” errors from lucide icons).
- `downloadCertPdf` (dashboard) builds a jsPDF layout (not the DOM snapshot) with gradient header, logo, signature, QR, and metadata.

## 5) Native App Download Problem & Fix Plan
- Problem: In Capacitor (Android/iOS), `Browser.open(blob:...)` does nothing; CustomTabs/SFSafariViewController cannot consume `blob:` URLs. Browser path with `jsPDF.save()` still works.
- Fix strategy (planned):
  1) Add `lib/nativeDownload.ts` with:
     - `isNativePlatform()` wrapping `Capacitor.isNativePlatform`.
     - `savePdfToDevice(fileName, blob)` that converts blob → base64 → `Filesystem.writeFile({ path: "certificates/<file>", directory: Documents, recursive: true })`, then `Share.share({ url: fileUri })`.
  2) Dependencies: `npm install @capacitor/filesystem @capacitor/share` then `npx cap sync` (Android + iOS).
  3) Wire into dashboard `downloadCertPdf`:
     ```ts
     import { isNativePlatform, savePdfToDevice } from "@/lib/nativeDownload";
     const filename = certNumber ? `PanAvest-Certificate-${certNumber}.pdf` : "PanAvest-Certificate.pdf";
     if (isNativePlatform()) {
       const blob = doc.output("blob");
       await savePdfToDevice(filename, blob);
     } else {
       doc.save(filename);
     }
     ```
     Remove any `Browser.open(blobUrl)` logic.
  4) Wire into `SimpleCertificate` download handler similarly (use `pdf.output("blob")` + `savePdfToDevice` when native, else `pdf.save`).
  5) UX after fix: Web saves via browser; native writes to `Documents/certificates/<file>` and opens the platform share sheet so users can save/open the PDF.

## 6) Verify Endpoint Expectations
- Default verification URL: `/verify?cert_id=<cert.id>` on the current origin (falls back to `https://kdslearning.com` server-side).
- If you move the verify page (e.g., `/certificates/verify`), update both dashboards and QR generation to the new path.

## 7) Upgrade Playbook
- Add a new interactive course: drop assets under `public/interactive/<key>`; map `<slug | course_id> -> /interactive/<key>` in `app/knowledge/[slug]/dashboard/page.tsx`; confirm via the debug helper.
- Change certificate design: update `components/SimpleCertificate.tsx` for the preview; update the jsPDF layout in `app/dashboard/page.tsx` for generated PDFs; keep QR/value wiring.
- Change verification logic: adjust `verifyUrl` builders; QR and downloads follow automatically.
- Add a new course with certificates: ensure `courses`, `exams`, `attempts`, and `certificates` rows exist; RLS allows users to read their own attempts/certificates; slides and progress are based on `course_slides` + `user_slide_progress`.
- Native download reliability: ensure `@capacitor/filesystem` + `@capacitor/share` are installed and synced; use `isNativePlatform()` branches for any download/share UI changes.

## 8) File Pointers (PWA)
- `app/knowledge/[slug]/dashboard/page.tsx` — interactive URL resolution + debug line.
- `app/dashboard/page.tsx` — dashboard data flow, certificate/provisional cards, `downloadCertPdf`.
- `components/SimpleCertificate.tsx` — inline certificate preview + DOM-to-PDF download (use native helper when added).
- `public/interactive/...` — interactive course packages.
- `capcitor.config.ts`, `android/`, `ios/` — native shells (run `npx cap sync` after adding plugins).
- `docs/ios-xcode-guide.md` — how to open the full iOS app in Xcode, run it on a simulator, and avoid the repo-specific codesign/DerivedData issue.

Keep this doc updated when you tweak verification paths, certificate layouts, or native download handling. It’s the fastest way to avoid regressions between the main site and the PWA/native shells.

## 9) Full Native iOS Rebuild Spec (SwiftUI, not Capacitor)

### What “full native” means in this repo
- Today the iOS app is not a real native product experience. It is a Capacitor shell that loads the deployed web app from `capacitor.config.ts` via `server.url`.
- A full native rebuild means the app UI, navigation, session handling, media flows, quizzes, dashboard, reader, certificates, and notifications move into SwiftUI/UIKit and no longer depend on Next.js pages rendering inside a remote `WKWebView`.
- You can still keep the current backend stack:
  - Supabase for auth, database, storage, and row-level security.
  - Existing Next.js API routes for AI, TTS, image lookup, ebook delivery, and interactive proxying.
- Important distinction:
  - Native app with some embedded web content: acceptable if only specific learning modules remain HTML/Storyline inside `WKWebView`.
  - Pure native app with zero web content: requires re-authoring every interactive HTML/Storyline module as native screens. If you keep Storyline packages in a web view, the app is native overall, but those modules are still web content.

### Current iOS state discovered in this codebase
- Capacitor shell:
  - `capacitor.config.ts` points iOS to `NEXT_PUBLIC_APP_URL` or `https://kds-pwa.vercel.app`.
  - `ios/App/App/MainViewController.swift` adds a native splash, native bottom tab bar, and a loading overlay around the web view.
  - `ios/App/App/AppDelegate.swift` is still standard Capacitor startup.
- Current native-only plugin usage is minimal:
  - `@capacitor/filesystem`
  - `@capacitor/share`
- Current native tab structure mirrors the web routes:
  - Home
  - Programs
  - E-Books
  - Dashboard
- Current app behavior is largely “access-only companion mode” on iOS:
  - Course and ebook access depend on already-linked account entitlements.
  - Payments happen on the website, not natively.

## 10) Full Native Screen Inventory

### Core app shell
| Native screen | Current source | Purpose | Must-have native behavior |
|---|---|---|---|
| Splash / launch | `ios/App/App/SplashViewController.swift` | Brand intro while app initializes | Native launch screen, app bootstrap, auth/session restore, remote config preload |
| Root tab shell | `components/BottomTabs.tsx`, `ios/App/App/MainViewController.swift` | Main navigation | Native `TabView`, state restoration, unread badges, deep-link routing |
| Offline blocking screen | `components/NoInternet.tsx`, `app/components/OfflineOverlay.tsx` | Global connectivity fallback | Native connectivity monitoring, retry, cached-state messaging |
| Global loading/toast layer | `components/LoadingOverlay.tsx`, `components/ui/toast.tsx` | App-wide feedback | Native progress HUD, inline loaders, banners, toasts |

### Authentication and account
| Native screen | Current source | Purpose | Must-have native behavior |
|---|---|---|---|
| Sign in | `app/auth/sign-in/page.tsx`, `components/AuthForm.tsx` | Password sign-in | Email/password auth, validation, session persistence, redirect back to intended screen |
| Sign up | `app/auth/sign-up/page.tsx`, `components/AuthForm.tsx` | Account creation | Email/password sign-up, email verification handling, post-sign-up onboarding |
| Profile/name editor | `app/dashboard/page.tsx` | Set `profiles.full_name` for certificates | Edit/save full name, validation, optimistic update |
| Account/settings | missing as dedicated screen | Account management | Sign out, notification status, legal links, app version, support |
| Forgot/reset password | only noted as “coming soon” | Missing today | Native password reset flow is required for a real app |

### Home and discovery
| Native screen | Current source | Purpose | Must-have native behavior |
|---|---|---|---|
| Home | `app/page.tsx` | Brand landing, account-aware greeting, featured surfaces | Greeting, sign-in/sign-out actions, featured programs, featured ebooks, PanAvest AI entry, companion-mode notice |
| About | linked from `app/page.tsx` but route missing | Company/program information | Native About screen or web fallback must be added |
| Legal screens | `README.md` contains privacy content | Privacy/compliance | Privacy Policy, Terms, support/contact, review-note-ready metadata |

### Programs and learning
| Native screen | Current source | Purpose | Must-have native behavior |
|---|---|---|---|
| Programs list | `app/courses/page.tsx` | Searchable list of linked/free programs | Search, list/grid, loading state, empty state, free-access badge |
| Program detail | `app/courses/[slug]/page.tsx` | Preview one program and gate access | Hero image, description, CPD points, coming soon badge, access state, “Open program” CTA |
| Program access/enroll | `app/courses/[slug]/enroll/page.tsx` | Current companion-mode gate | Either native purchase screen or website handoff screen depending on commerce model |
| Program dashboard | `app/courses/[slug]/dashboard/page.tsx` | Main learning experience | Chapters, slides, progress, media rendering, mark done, next/prev, notices, mobile action bar |
| Chapters drawer | `app/courses/[slug]/dashboard/page.tsx` | Slide navigation by chapter | Native sheet/drawer with lock states and quiz status badges |
| Chapter quiz | `app/courses/[slug]/dashboard/page.tsx` | Timed per-chapter assessment | Randomization, timers, answer selection, submit, persistence, score display |
| Final exam pre-check | `app/courses/[slug]/dashboard/page.tsx` | Readiness confirmation | Gating by slide completion and chapter quizzes, online check, acknowledgement checkbox |
| Final exam session | `app/courses/[slug]/dashboard/page.tsx` | Timed final assessment | Countdown timer, answer state, one-attempt rules, auto-submit rules, offline warning |
| Final exam result | `app/courses/[slug]/dashboard/page.tsx` | Pass/fail summary | Score, pass mark, chapter score recap, certificate eligibility |
| Interactive knowledge player | `app/knowledge/[slug]/dashboard/page.tsx`, `InteractiveDashboardClient.tsx` | Storyline/HTML package playback | Native decision required: keep `WKWebView` for existing packages or rewrite packages natively |

### E-books
| Native screen | Current source | Purpose | Must-have native behavior |
|---|---|---|---|
| E-book list | `app/ebooks/page.tsx` | Searchable list of linked ebooks | Search, access-state messaging, linked/free badges, empty state |
| E-book detail | `app/ebooks/[slug]/page.tsx` | Detail + ownership gate | Cover, description, price or access copy, sign-in/manage/open actions |
| E-book reader | `app/ebooks/[slug]/page.tsx` | Secure PDF reading | PDF rendering, fit-width/fixed zoom, secure token fetch, reopen state, native share policy |

### Dashboard and outcomes
| Native screen | Current source | Purpose | Must-have native behavior |
|---|---|---|---|
| Dashboard home | `app/dashboard/page.tsx` | Personalized learner hub | Quick actions, linked ebooks, continue learning, certificates, scores |
| Certificates list/detail | `app/dashboard/page.tsx`, `components/SimpleCertificate.tsx` | Issued and provisional certificates | Preview, metadata, QR, download/share, course deep links |
| Quiz score history | `app/dashboard/page.tsx` | Performance history | Group scores by course, sort by chapter order, timestamp display |
| Public certificate verify | certificate URLs point to `/verify`, but route is missing | Public validation | Required new screen/API if certificates are part of the native experience |

### Notifications and AI
| Native screen | Current source | Purpose | Must-have native behavior |
|---|---|---|---|
| Notification settings/test | `app/notifications/page.tsx` | Web push enablement | Native notification permission flow, remote token registration, preference toggles |
| PanAvest AI | `app/panavest-ai/page.tsx`, `components/panavest-ai/PanavestAiClient.tsx` | Supply-chain dictionary + AI explainer | Search, suggestions, message history, AI cards, TTS, image context |
| AI settings | `PanavestAiClient.tsx` | Voice and auto-read settings | Voice picker, auto-read toggle, persisted settings |

## 11) Feature Parity Required for the Native App

### Authentication and session
- Native Supabase auth or direct GoTrue integration for:
  - sign in
  - sign up
  - session persistence
  - token refresh
  - sign out
- Redirect/return-path handling so a protected screen can send the user to auth and return them correctly.
- Profile sync for `profiles.full_name`.
- Email verification and reset-password UX, which is incomplete in the current web app.

### Program discovery and entitlement gating
- Fetch linked programs from:
  - `enrollments`
  - `courses`
- Respect `free_for_logged_in` courses.
- Show coming-soon programs.
- Use the same logic as the current app:
  - linked enrollment row means access
  - free-for-logged-in means access without payment

### Learning delivery
- Load course structure from:
  - `course_chapters`
  - `course_slides`
- Render all current slide asset types:
  - video
  - PDF
  - image
  - external asset link
  - HTML body/content
- Preserve gating logic:
  - later slides lock until previous slide is done
  - chapter boundary locks until chapter quiz is completed
- Sync `user_slide_progress` to the server.
- Keep a local offline progress cache and merge on reconnect.

### Chapter quizzes
- Load questions from `chapter_quiz_questions`.
- Load configuration from `chapter_quiz_settings`.
- Randomly sample quiz items according to `num_questions`.
- Run a countdown timer from `time_limit_seconds`.
- Save attempts into `user_chapter_quiz`.
- Show latest score per chapter in dashboard and results views.

### Final exam
- Load exam data from:
  - `exams`
  - `questions`
  - `attempts`
- Gate exam start until:
  - all slides completed
  - all required chapter quizzes completed
- Enforce:
  - one-attempt behavior
  - auto-submit on timer expiry
- Current web anti-cheat measures such as disabling copy, print, or tab switching are weak in practice. A native app can better control the test UI, but it still cannot guarantee zero cheating. Treat this as deterrence, not security.

### Dashboard
- Continue learning cards with progress percent recomputed from slides, not legacy `enrollments.progress_pct`.
- Linked ebook carousel.
- Certificates list.
- Provisional certificate logic:
  - 100% slide completion
  - passing latest exam attempt
  - no certificate row yet
- Score history grouped by course/chapter.

### Certificates
- Native certificate preview screen or reusable native certificate card.
- Download/share PDF natively.
- QR code support for verification URLs.
- Native share sheet integration.
- Optional save-to-files support.
- Public verify experience is required because the current app generates verify URLs but has no implemented `/verify` page in this repo.

### E-books
- Load linked ebook data from:
  - `ebook_purchases`
  - `ebooks`
- Securely fetch PDF bytes from `app/api/ebooks/secure-pdf/route.ts` or a new native-friendly backend.
- Native reader requirements:
  - page rendering
  - zoom
  - fit width
  - resume reading position
  - error handling for expired session / not linked / file missing
- If you want a truly native reader, use `PDFKit`. If you keep the current PDF.js approach in a web view, that reader is not fully native.

### PanAvest AI
- CSV-backed dictionary loading from:
  - `/public/scmpedia_full_UPDATED.csv`
  - `/public/scmpedia_full.csv`
- Fuzzy search using equivalent native search logic.
- Suggestion list with keyboard selection behavior.
- Rich concept card features:
  - definition
  - synonyms
  - tags
  - examples
  - copy action
- AI explanation via `/api/ai`.
- Image lookup via `/api/image`.
- TTS via `/api/tts`, with native voice fallback if external TTS is unavailable.
- Settings persistence for voice and auto-read.

### Notifications
- The current implementation is web-push oriented:
  - FCM script registration
  - browser permission request
  - stub subscribe/test endpoints
- A real native iOS app needs:
  - `UNUserNotificationCenter` permission flow
  - APNs token registration
  - backend token storage
  - remote notification payload handling
  - in-app notification routing
  - settings screen for notification preferences

### Offline, caching, and sync
- Connectivity monitoring equivalent to current `online/offline` and overlay behavior.
- Local cache for:
  - session data
  - lightweight course metadata
  - last-known progress
  - ebook reading position
  - PanAvest AI dataset
- Conflict resolution rules when local progress and server progress differ.

### Deep linking and app routing
- Universal links for:
  - programs
  - ebooks
  - dashboard
  - certificate verify pages
  - optional AI term URLs
- Restore screen state when app opens from:
  - notification taps
  - external links
  - certificate QR scans

## 12) Backend and Data Dependencies the Native App Still Needs

### Supabase tables currently used
- `profiles`
- `courses`
- `enrollments`
- `course_chapters`
- `course_slides`
- `user_slide_progress`
- `chapter_quiz_questions`
- `chapter_quiz_settings`
- `user_chapter_quiz`
- `exams`
- `questions`
- `attempts`
- `certificates`
- `ebooks`
- `ebook_purchases`
- `payments`

### Existing Next.js API routes the native app can reuse
- `app/api/ebooks/route.ts`
  - list linked ebooks
- `app/api/ebooks/[slug]/route.ts`
  - fetch one linked ebook by slug
- `app/api/ebooks/secure-pdf/route.ts`
  - stream secure ebook PDF
- `app/api/ai/route.ts`
  - AI explanations for PanAvest AI
- `app/api/tts/route.ts`
  - TTS audio generation
- `app/api/image/route.ts`
  - image lookup for AI cards
- `app/api/interactive/proxy/route.ts`
  - proxied interactive content
- `app/api/payments/paystack/*`
  - only relevant if iOS remains web-checkout companion mode
- `app/api/push/*`
  - currently stubs and not sufficient for a native push implementation

## 13) Native Architecture Recommendation

### Recommended app stack
- SwiftUI app shell.
- `TabView` for primary navigation.
- `NavigationStack` for in-tab flows.
- Service layer split by domain:
  - `AuthService`
  - `ProfileService`
  - `CoursesService`
  - `AssessmentsService`
  - `EbooksService`
  - `CertificatesService`
  - `NotificationsService`
  - `PanavestAIService`
  - `PurchaseService`
- Native frameworks to use:
  - `SwiftUI` for UI
  - `AVKit` for video
  - `PDFKit` for ebook reading
  - `WebKit` only if interactive Storyline packages remain web content
  - `UserNotifications` for permissions and notification handling
  - `StoreKit 2` if digital purchases happen inside iOS
  - `ShareLink` or `UIActivityViewController` for certificate sharing
  - `Network` for connectivity monitoring
  - `SwiftData` or a local store for lightweight caching and queued sync

### Recommended information architecture
- Tab 1: Home
- Tab 2: Programs
- Tab 3: E-Books
- Tab 4: Dashboard
- Tab 5: AI

### If you want strict “no webview” native
- Rebuild all interactive programs from `public/interactive/...` into native course scenes.
- Replace HTML body rendering with native text/media blocks.
- Replace proxied Storyline logic with app-managed sequencing, interactions, and scoring.
- This is a much larger project than replacing the Capacitor shell.

## 14) Payment and App Store Constraints (Important)

### Current repo reality
- Web/Next.js currently uses Paystack to unlock:
  - courses
  - ebooks
- That matches the current iOS companion-model approach.

### Apple rules you must design around
- As of March 25, 2026, Apple’s App Review Guidelines say that if you unlock features or premium content inside the app, you must use in-app purchase.
- Apple’s guideline also says reader apps may allow access to previously purchased books/audio/video content, but that exception does not automatically cover selling course access with web checkout inside the iOS app.
- Practical meaning for this app:
  - If iOS stays access-only, you can keep website-managed payments and linked-content access.
  - If iOS will sell or unlock digital courses/ebooks inside the app, you should plan on `StoreKit 2`, not Paystack, for the iOS purchase flow.

### Two valid product directions
- Direction A: Native companion/access-only app
  - Fastest path.
  - Keep external website for purchase/enrollment.
  - Native app focuses on sign-in, learning, ebooks, certificates, AI, notifications.
  - Lowest App Review risk.
- Direction B: Native full-commerce app
  - Replace iOS Paystack purchase entry points with StoreKit 2 products.
  - Create App Store Connect products for:
    - course unlocks
    - ebook unlocks
    - optional subscriptions if you move to a membership model
  - Map StoreKit entitlements to your Supabase access tables.
  - Add restore purchases and server-side entitlement reconciliation.

## 15) Concrete Gaps in This Repo That Must Be Fixed During the Rebuild
- Missing public certificate verification page:
  - certificates point to `/verify?cert_id=...`
  - no `/verify` route exists in `app/`
- Missing About page:
  - home page links to `/about`
  - no `/about` route exists in `app/`
- Push implementation is incomplete:
  - `app/api/push/subscribe/route.ts` is a stub
  - `app/api/push/test/route.ts` is a stub
- Current notification model is browser-web-push oriented, not APNs-native.
- Current ebook secure delivery uses `sample_url` as the PDF source, which may not be the final secure-storage design you want long-term.
- Current interactive modules are still web packages and therefore not fully native content.
- Password reset is not implemented.
- There is no dedicated account/settings screen.

## 16) Delivery Plan

### Phase 1: Native foundation
- Build SwiftUI app shell.
- Implement auth/session restore.
- Implement native tab/navigation structure.
- Add account/profile/settings.
- Add offline/connectivity layer.

### Phase 2: Programs and ebooks
- Programs list/detail/dashboard.
- Native ebook list/detail/reader.
- Progress sync and local cache.
- Interactive module strategy:
  - temporary `WKWebView`, or
  - full native rewrite

### Phase 3: Assessments and dashboard
- Chapter quizzes.
- Final exam flow.
- Dashboard sections.
- Score history.
- Certificate previews and downloads.
- Public verify screen/API.

### Phase 4: AI and notifications
- PanAvest AI native UI.
- TTS and image flows.
- APNs registration and backend token handling.
- Notification deep links.

### Phase 5: Commerce and App Store hardening
- Keep access-only, or
- implement StoreKit 2 purchase flows.
- App Review notes, demo credentials, legal screens, universal links, crash reporting, analytics.

## 17) Definition of Done for a Real Native iOS App
- No Capacitor runtime.
- No remote Next.js route rendering inside the main app flow.
- All primary screens and navigation are native.
- Auth, progress, certificates, ebooks, AI, and notifications work without relying on a web page UI.
- Payment strategy is compliant with the iOS storefronts you plan to support.
- Missing verify/about destinations are implemented.
- App Review can test the full app with working credentials and live backend services.

## 18) Apple References to Design Against
- App Review Guidelines:
  - https://developer.apple.com/app-store/review/guidelines/
- StoreKit 2:
  - https://developer.apple.com/storekit/
- Notification authorization:
  - https://developer.apple.com/documentation/usernotifications/asking-permission-to-use-notifications
- Universal links:
  - https://developer.apple.com/documentation/xcode/allowing-apps-and-websites-to-link-to-your-content
