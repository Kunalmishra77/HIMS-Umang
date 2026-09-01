"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { getSupabaseClient } from "@/lib/supabase/client"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

const GENERIC_ERROR =
  "We couldn't match those details. Check your UHID, phone number and name exactly as given at the hospital, or ask reception for help."

export default function ClaimPage() {
  const router = useRouter()
  const [fullName, setFullName] = useState("")
  const [uhid, setUhid] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError("")
    try {
      const res = await fetch("/api/patient/claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, uhid, phone, fullName }),
      })
      const json = (await res.json()) as { ok: boolean }
      if (!json.ok) {
        setError(GENERIC_ERROR)
        return
      }
      const supabase = getSupabaseClient()
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) {
        // The record is claimed but the session failed — send them to sign in
        // rather than leaving them on a form that would now report "already claimed".
        router.push("/login")
        return
      }
      router.push("/patient/dashboard")
    } catch {
      setError(GENERIC_ERROR)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 rounded-xl border border-border bg-surface p-8 shadow-sm">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold text-foreground">Claim your patient record — Umang Hospital</h1>
          <p className="text-sm text-foreground-lighter">
            Match your existing hospital record to set up your portal sign-in.
          </p>
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-foreground" htmlFor="fullName">Full name</label>
          <Input
            id="fullName"
            type="text"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-foreground" htmlFor="uhid">UHID</label>
          <Input id="uhid" type="text" required value={uhid} onChange={(e) => setUhid(e.target.value)} />
          <p className="text-xs text-foreground-lighter">
            Printed on your registration slip and prescription.
          </p>
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-foreground" htmlFor="phone">Phone number</label>
          <Input id="phone" type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-foreground" htmlFor="email">Email</label>
          <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-foreground" htmlFor="password">Password</label>
          <Input
            id="password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button
          type="submit"
          disabled={submitting || !fullName || !uhid || !phone || !email || !password}
          className="w-full"
        >
          {submitting ? "Claiming..." : "Claim my record"}
        </Button>
        <p className="text-center text-sm text-foreground-lighter">
          Already claimed your record?{" "}
          <Link href="/login" className="font-medium text-accent hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </div>
  )
}
