// File: app/auth/sign-up/page.tsx
import Image from "next/image"
import Link from "next/link"
import AuthForm from "@/components/AuthForm"

export default function SignUpPage() {
  return (
    <div className="fixed inset-0 overflow-hidden bg-[var(--color-bg)] no-copy">
      {/* Top brand hero */}
      <div
        className="relative h-[38vh] min-h-[220px] bg-[var(--color-primary)] text-white rounded-b-[28px] flex items-center justify-center px-6"
        style={{ ["--color-primary" as any]: "#b65437" }}
      >
        <div className="flex flex-col items-center">
          <h1 className="text-2xl font-bold leading-tight">Create Account</h1>
          <p className="text-sm opacity-90 mt-1 text-center max-w-[300px]">
            Join KDS Learning to access courses and e-books with secure reader.
          </p>
        </div>
      </div>

      {/* Centered card */}
      <div className="absolute left-0 right-0 top-[34vh] px-5">
        <div className="mx-auto w-full max-w-[420px] bg-white rounded-2xl shadow-xl border border-[var(--color-light)] p-6">
          <AuthForm mode="sign-up" />

          <p className="mt-5 text-sm text-center text-muted">
            Already have an account?{" "}
            <Link
              href="/auth/sign-in"
              data-kds-loading   // <— show loading fade on tap
              className="font-medium"
              style={{ color: "#0a1156" }}
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
