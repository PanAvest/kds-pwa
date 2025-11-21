"use client"
import React from "react"
import { supabase } from "@/lib/supabaseClient"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { pushToast } from "@/components/ui/toast"
import { startGlobalLoading } from "@/utils/globalLoading"
import { useRouter } from "next/navigation"

export default function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [showPass, setShowPass] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const router = useRouter()

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const stopGlobal = startGlobalLoading("auth")
    try {
      if (mode === "sign-in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        pushToast("Signed in successfully")
        router.push("/dashboard")
      } else {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        pushToast("Account created! Check your email to verify.")
        router.push("/dashboard")
      }
    } catch (err: any) {
      pushToast(err.message || "Authentication failed")
    } finally {
      setLoading(false)
      stopGlobal()
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="text-left">
        <label className="block text-[12px] font-medium mb-1">Email</label>
        <div className="relative">
          <Input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            className="pl-10 text-sm h-11"
          />
          {/* mail icon */}
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 opacity-60">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M4 6h16v12H4z" stroke="currentColor" strokeWidth="1.5" />
              <path d="M4 7l8 6 8-6" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </span>
        </div>
      </div>

      <div className="text-left">
        <label className="block text-[12px] font-medium mb-1">Password</label>
        <div className="relative">
          <Input
            type={showPass ? "text" : "password"}
            placeholder="Your password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            className="pl-10 pr-20 text-sm h-11"
          />
          {/* lock icon */}
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 opacity-60">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <rect x="6" y="11" width="12" height="9" rx="2" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M8 11V8a4 4 0 118 0v3" stroke="currentColor" strokeWidth="1.5"/>
            </svg>
          </span>
          <button
            type="button"
            onClick={() => setShowPass(s => !s)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] px-2 py-1 rounded-md border"
          >
            {showPass ? "Hide" : "Show"}
          </button>
        </div>
      </div>

      <Button disabled={loading} className="w-full h-11 text-[15px] font-semibold">
        {loading ? "Please wait…" : mode === "sign-in" ? "Sign In" : "Create Account"}
      </Button>

      {mode === "sign-in" && (
        <p className="text-[12px] text-muted text-center">
          Forgot password? Use “Reset via email” on the next screen (coming soon).
        </p>
      )}
    </form>
  )
}
