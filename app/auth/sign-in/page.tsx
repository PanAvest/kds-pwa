import Image from "next/image"
import Link from "next/link"
import AuthForm from "@/components/AuthForm"

/**
 * App-like layout:
 * - Fullscreen hero header in brand color (#0a1156) with rounded bottom
 * - Overlapping white card with form (perfectly centered & sized)
 * - Scrolling disabled via fixed container + overflow-hidden
 */
export default function SignInPage() {
  return (
    <div className="fixed inset-0 overflow-hidden bg-[var(--color-bg)]">
      {/* Top brand hero */}
      <div
        className="relative h-[38vh] min-h-[220px] bg-[var(--color-primary)] text-white rounded-b-[28px] flex items-center justify-center px-6"
        style={{ ["--color-primary" as any]: "#b65437" }}
      >
        <div className="flex flex-col items-center">
         
          <h1 className="text-2xl font-bold leading-tight">Welcome Back</h1>
          <p className="text-sm opacity-90 mt-1 text-center max-w-[280px]">
            Sign in to access your dashboard and continue learning.
          </p>
        </div>
      </div>

      {/* Centered card */}
      <div className="absolute left-0 right-0 top-[34vh] px-5">
        <div className="mx-auto w-full max-w-[420px] bg-white rounded-2xl shadow-xl border border-[var(--color-light)] p-6">
          <AuthForm mode="sign-in" />

          <p className="mt-5 text-sm text-center text-muted">
            Don’t have an account?{" "}
            <Link href="/auth/sign-up" className="font-medium" style={{ color: "#0a1156" }}>
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
