"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { Mail, Lock, Eye, EyeOff, ArrowRight, QrCode, ShieldCheck, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { useAuthStore } from "@/store/useAuthStore"
import { getSupabaseClient } from "@/lib/supabase/client"

// Where each real role lands after signing in. Mirrors /login's map; `admin` is
// deliberately absent — it ships no portal (src/types/roles.ts) — and falls
// through to the landing page.
const ROLE_DASHBOARD: Record<string, string> = {
  doctor: "/doctor/dashboard",
  nurse: "/nurse/dashboard",
  reception: "/reception/dashboard",
  billing: "/billing/dashboard",
  patient: "/patient/dashboard",
}

export function HeroSignIn() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPw, setShowPw] = useState(false)
  const [busy, setBusy] = useState(false)

  // Same real sign-in as /login: authenticate against Supabase, bridge the
  // session into server-readable cookies so the proxy and Server Components
  // (and the session-gated /api/opd-advance) see it, then route by the
  // account's TRUE role rather than anything chosen in this form.
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    try {
      const supabase = getSupabaseClient()
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error || !data.session) {
        toast.error(error?.message ?? "Sign-in failed")
        return
      }

      const syncRes = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        }),
      })
      if (!syncRes.ok) {
        toast.error("Signed in, but couldn't sync the session — try again")
        return
      }

      await useAuthStore.getState().hydrateFromSession()
      const currentUser = useAuthStore.getState().currentUser
      if (!currentUser) {
        toast.error("Signed in, but no staff profile found for this account")
        return
      }

      router.push(ROLE_DASHBOARD[currentUser.role as string] ?? "/")
    } finally {
      setBusy(false)
    }
  }

  return (
    <motion.div
      id="signin"
      initial={{ opacity: 0, y: 20, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="relative rounded-3xl bg-white border border-[#EAECF2] shadow-[0_24px_60px_rgba(16,24,40,0.12)] p-6 lg:p-7"
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="h-9 w-9 rounded-xl bg-[var(--color-primary)]/[0.08] text-[var(--color-accent)] flex items-center justify-center">
          <ShieldCheck className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-[18px] font-bold text-[#101828] leading-tight">Sign in to your console</h2>
          <p className="text-[12.5px] text-[#667085]">Secure, role-based access</p>
        </div>
      </div>

      <form onSubmit={submit} className="mt-5 space-y-3.5">
        <div>
          <label className="block text-[12.5px] font-semibold text-[#344054] mb-1.5">Work email</label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#98A2B3]" />
            <input
              type="email" required value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@hospital.org" autoComplete="username"
              className="w-full h-11 pl-9 pr-3 rounded-xl border border-[#EAECF2] bg-white text-[14px] text-[#101828] placeholder:text-[#98A2B3] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20 transition"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-[12.5px] font-semibold text-[#344054]">Password</label>
            <button type="button" className="text-[11.5px] font-semibold text-[var(--color-accent)] hover:underline cursor-pointer">Forgot?</button>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#98A2B3]" />
            <input
              type={showPw ? "text" : "password"} required value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" autoComplete="current-password"
              className="w-full h-11 pl-9 pr-10 rounded-xl border border-[#EAECF2] bg-white text-[14px] text-[#101828] placeholder:text-[#98A2B3] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20 transition"
            />
            <button type="button" onClick={() => setShowPw(v => !v)} aria-label={showPw ? "Hide password" : "Show password"}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-[#98A2B3] hover:text-[#475467] hover:bg-[#F8FAFC] cursor-pointer">
              {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <button type="submit" disabled={busy}
          className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-xl text-[15px] font-semibold text-white bg-[var(--color-primary-dark)] hover:bg-[#1a5667] transition-colors cursor-pointer shadow-[0_8px_24px_rgba(30,151,178,0.18)] disabled:opacity-70">
          {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Signing in…</> : <>Sign in <ArrowRight className="h-4 w-4" /></>}
        </button>
      </form>

      <div className="flex items-center gap-3 my-4">
        <span className="h-px flex-1 bg-[#EAECF2]" />
        <span className="text-[11px] font-semibold text-[#98A2B3]">or</span>
        <span className="h-px flex-1 bg-[#EAECF2]" />
      </div>

      <button onClick={() => router.push("/checkin")}
        className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-xl text-[14px] font-semibold text-[#344054] bg-white border border-[#EAECF2] hover:border-[#D0D5DD] transition-colors cursor-pointer">
        <QrCode className="h-4 w-4 text-[var(--color-accent)]" /> Patient self check-in
      </button>

      <p className="mt-3 text-center text-[11.5px] text-[#98A2B3]">
        Your console opens automatically based on your account&apos;s role.
      </p>
    </motion.div>
  )
}
