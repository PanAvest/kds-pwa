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

Keep this doc updated when you tweak verification paths, certificate layouts, or native download handling. It’s the fastest way to avoid regressions between the main site and the PWA/native shells.
