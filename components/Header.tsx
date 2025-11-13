"use client";
import React from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";

export default function Header() {
  const [user, setUser] = React.useState<any>(null);
  const [fullName, setFullName] = React.useState<string>("");
  const nameMissing = !fullName?.trim();

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      const u = data.user ?? null;
      setUser(u);

      if (u?.id) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", u.id)
          .maybeSingle();
        if (!cancelled) setFullName((prof?.full_name ?? "").trim());
      } else setFullName("");
    }

    load();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, s) => {
      if (cancelled) return;
      const u = s?.user ?? null;
      setUser(u);
      if (u?.id) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", u.id)
          .maybeSingle();
        if (!cancelled) setFullName((prof?.full_name ?? "").trim());
      } else setFullName("");
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return (
    <header
      className="
        px-4
        pt-[max(env(safe-area-inset-top),0.75rem)]
        pb-3
        bg-[var(--color-bg)]
      "
    >
      <div className="flex items-center justify-between">
        <div className="flex flex-col leading-tight">
          <span className="text-base font-semibold text-[var(--color-text-dark)]">
            {user
              ? nameMissing
                ? "Welcome"
                : `Welcome, ${fullName}`
              : "Welcome to KDS Learning"}
          </span>
          {user && nameMissing && (
            <Link
              href="/dashboard"
              className="text-[12px] text-[var(--color-text-muted)]"
            >
              Add your full name on the Dashboard
            </Link>
          )}
        </div>

        <div className="flex items-center gap-2">
          {user ? (
            <Button
              variant="outline"
              className="text-sm px-3"
              onClick={() => supabase.auth.signOut()}
            >
              Sign out
            </Button>
          ) : (
            <>
              <Link href="/auth/sign-in">
                <Button variant="outline" className="text-sm px-3">
                  Sign In
                </Button>
              </Link>
              <Link href="/auth/sign-up">
                <Button className="text-sm px-3">Sign Up</Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
