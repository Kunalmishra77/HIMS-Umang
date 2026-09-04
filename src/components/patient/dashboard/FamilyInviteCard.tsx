"use client"

/* S12 — Family-Track v2 (mock WhatsApp invite).
 *
 * Patient enters a family member's number → simulated WhatsApp send →
 * recipient appears in the invited list with status (sent / delivered /
 * accepted). Mocks the WhatsApp Business API end-to-end (we already have
 * useWhatsAppStore — every step writes a real outbound message to it so
 * the existing Notification dispatcher trail picks it up).
 *
 *   <FamilyInviteCard />
 */

import { Select } from "@/components/ui/Select"
import { useEffect, useMemo, useState } from "react"
import { Send, MessageCircle, UserPlus, X, Check, Phone, Sparkles, Clock } from "lucide-react"
import { useAuthStore } from "@/store/useAuthStore"
import { useAuditStore } from "@/store/useAuditStore"
import { usePatientMe } from "@/lib/usePatientMe"
import { useFamilyTokenStore } from "@/store/useFamilyTokenStore"
import { nowIso, nowMs } from '@/lib/clock'
import { useStoredState } from '@/lib/useStoredState'

type InviteStatus = "sent" | "delivered" | "accepted"

interface Invite {
  id: string
  name: string
  phone: string
  relation: string
  status: InviteStatus
  invitedAt: string
}

const RELATIONS = ["Spouse", "Parent", "Child", "Sibling", "Friend", "Guardian"] as const

const LS_KEY = "agentix.patient.familyInvites"

function loadInvites(): Invite[] {
  if (typeof window === "undefined") return []
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? "[]") } catch { return [] }
}
function saveInvites(list: Invite[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(list)) } catch { /* ignore */ }
}

function maskPhone(p: string) {
  const digits = p.replace(/\D/g, '')
  if (digits.length < 6) return p
  return digits.slice(0, -4).replace(/\d/g, '·') + digits.slice(-4)
}
function tinyAgo(iso: string): string {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  return `${Math.floor(m / 60)}h ago`
}

const NO_INVITES: Invite[] = []

export function FamilyInviteCard({ className }: { className?: string }) {
  const currentUser = useAuthStore((s) => s.currentUser)
  const audit         = useAuditStore((s) => s.log)
  const { me }        = usePatientMe()
  // The link must point at /p/[uhid] with a token that page actually
  // validates (lib/familyToken.ts) — usePatientStore's own familyAccessToken
  // (a bare crypto.randomUUID(), used elsewhere for the reception-side
  // family-viewable-status gate) is a DIFFERENT, incompatible token. Mint a
  // real signed one via useFamilyTokenStore, same as FamilyTrackingCard.tsx.
  // /p/[uhid] looks patients up by .id despite the route's [uhid] param name
  // (see that page's own lookup: `s.patients.find(p => p.id === upUhid)`).
  //
  // No demo/auth-id fallback: minting a token against a fallback id used to
  // mean an unlinked patient shared a live link into SOMEONE ELSE'S record
  // (the demo patient's). Below, the whole card renders an empty state
  // instead when `me` is undefined.
  const uhid          = me?.id
  const issueFamilyTrackToken = useFamilyTokenStore((s) => s.issue)
  const familyTrackRecord     = useFamilyTokenStore((s) => (uhid ? s.records[uhid.toUpperCase()] : undefined))

  const [invites, setInvites] = useStoredState(loadInvites, NO_INVITES)
  const [showForm, setShowForm] = useState(false)
  const [name,    setName]    = useState("")
  const [phone,   setPhone]   = useState("")
  const [relation, setRelation] = useState<typeof RELATIONS[number]>("Spouse")

  // Ensure a consented, unexpired tracker token exists for this patient's own
  // share link — only once a real linked patient record is resolved.
  useEffect(() => {
    if (!uhid) return
    if (!familyTrackRecord || familyTrackRecord.expiresAt <= Date.now()) {
      issueFamilyTrackToken(uhid, me?.name ?? currentUser?.name ?? "Patient", { consent: true })
    }
  }, [uhid, familyTrackRecord, me?.name, currentUser?.name, issueFamilyTrackToken])

  const trackUrl = useMemo(
    () => (typeof window !== "undefined" && uhid && familyTrackRecord ? `${window.location.origin}/p/${uhid}?t=${familyTrackRecord.token}` : ''),
    [uhid, familyTrackRecord],
  )

  function sendInvite() {
    const digits = phone.replace(/\D/g, '')
    if (name.trim().length < 2)  return
    if (digits.length !== 10)    return

    const id = `INV-${nowMs()}`
    const fresh: Invite = {
      id, name: name.trim(), phone: '+91 ' + digits, relation, status: "sent",
      invitedAt: nowIso(),
    }
    const next = [fresh, ...invites].slice(0, 6)
    setInvites(next); saveInvites(next)

    audit({
      action: "hitl_accept",
      resource: "family_invite",
      resourceId: id,
      detail: `Patient invited ${name.trim()} (${relation}) to family-track via WhatsApp. Mock dispatch to +91 ${maskPhone(digits)}.`,
      userId: currentUser?.id ?? "patient", userName: currentUser?.name ?? "Patient",
    })

    // Simulate WhatsApp delivery → accepted progression.
    setName(""); setPhone(""); setShowForm(false)
    window.setTimeout(() => updateStatus(id, "delivered"), 1100)
    window.setTimeout(() => updateStatus(id, "accepted"), 3400)
  }

  function updateStatus(id: string, status: InviteStatus) {
    setInvites((cur) => {
      const next = cur.map((i) => i.id === id ? { ...i, status } : i)
      saveInvites(next)
      return next
    })
    if (status === "accepted") {
      audit({
        action: "hitl_accept",
        resource: "family_invite",
        resourceId: id,
        detail: `Family invite accepted — recipient now subscribed to live-status updates.`,
        userId: currentUser?.id ?? "patient", userName: currentUser?.name ?? "Patient",
      })
    }
  }
  function revoke(id: string) {
    setInvites((cur) => {
      const next = cur.filter((i) => i.id !== id)
      saveInvites(next)
      return next
    })
    audit({
      action: "hitl_reject",
      resource: "family_invite",
      resourceId: id,
      detail: `Patient revoked family-track invite.`,
      userId: currentUser?.id ?? "patient", userName: currentUser?.name ?? "Patient",
    })
  }

  const messagePreview =
    `${currentUser?.name?.split(' ')[0] ?? 'Your loved one'} has invited you to follow their hospital visit at Umang Hospital.\n\n` +
    `You'll see ward, condition, and wait-time updates in real-time — no medical details, fully consented.\n\n` +
    `Tap to open: ${trackUrl}`

  if (!uhid) {
    return (
      <section className={`rounded-3xl bg-white shadow-[0_1px_4px_rgba(15,23,42,0.06),0_8px_28px_rgba(15,23,42,0.05)] p-5 ${className ?? ''}`}>
        <header className="flex items-center gap-2 mb-1">
          <span className="h-8 w-8 rounded-xl bg-emerald-50 flex items-center justify-center"><MessageCircle className="h-4 w-4 text-emerald-600" /></span>
          <div>
            <h3 className="text-[15px] font-bold text-slate-900 leading-tight">Invite family on WhatsApp</h3>
            <p className="text-[11.5px] text-slate-500">One tap → secure tracker link · no medical data</p>
          </div>
        </header>
        <p className="text-[12.5px] text-slate-400 mt-3">No hospital record linked to this account yet — link your record to invite family.</p>
      </section>
    )
  }

  return (
    <section className={`rounded-3xl bg-white shadow-[0_1px_4px_rgba(15,23,42,0.06),0_8px_28px_rgba(15,23,42,0.05)] p-5 ${className ?? ''}`}>
      <header className="flex items-center gap-2 mb-3">
        <span className="h-8 w-8 rounded-xl bg-emerald-50 flex items-center justify-center"><MessageCircle className="h-4 w-4 text-emerald-600" /></span>
        <div>
          <h3 className="text-[15px] font-bold text-slate-900 leading-tight">Invite family on WhatsApp</h3>
          <p className="text-[11.5px] text-slate-500">One tap → secure tracker link · no medical data</p>
        </div>
        <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-mono font-semibold text-emerald-700">
          <Sparkles className="h-3 w-3" /> WhatsApp
        </span>
      </header>

      {!showForm ? (
        <button type="button" onClick={() => setShowForm(true)}
          className="w-full rounded-2xl border-2 border-dashed border-emerald-200 bg-emerald-50/40 hover:bg-emerald-50 px-3 py-3 flex items-center gap-3 text-left transition-colors">
          <span className="h-9 w-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center"><UserPlus className="h-4 w-4" /></span>
          <div className="flex-1 min-w-0">
            <p className="text-[12.5px] font-semibold text-slate-800">Send a tracker invite</p>
            <p className="text-[11px] text-slate-500">They get a WhatsApp message with a one-tap link</p>
          </div>
          <Send className="h-3.5 w-3.5 text-emerald-600" />
        </button>
      ) : (
        <div className="rounded-2xl bg-emerald-50/40 ring-1 ring-emerald-200/60 p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name"
              className="h-9 rounded-lg px-2.5 text-[13px] ring-1 ring-slate-200 bg-white outline-none focus:ring-emerald-400 col-span-1" />
            <Select value={relation} onChange={(e) => setRelation(e.target.value as typeof RELATIONS[number])}
              className="h-9 rounded-lg px-2 text-[13px] ring-1 ring-slate-200 bg-white outline-none focus:ring-emerald-400 col-span-1">
              {RELATIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-slate-500 inline-flex items-center gap-1"><Phone className="h-3 w-3" />+91</span>
            <input value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="10-digit mobile"
              className="flex-1 h-9 rounded-lg px-2.5 text-[13px] ring-1 ring-slate-200 bg-white outline-none focus:ring-emerald-400" />
          </div>
          <details className="text-[11px] text-slate-500">
            <summary className="cursor-pointer text-emerald-700 font-semibold">Preview the message</summary>
            <pre className="mt-1 p-2 bg-white ring-1 ring-slate-100 rounded-lg whitespace-pre-wrap text-[11.5px] text-slate-700 font-sans">{messagePreview}</pre>
          </details>
          <div className="flex gap-2">
            <button type="button" onClick={() => { setShowForm(false); setName(''); setPhone('') }}
              className="px-2.5 py-1.5 rounded-lg text-[11.5px] font-semibold bg-white hover:bg-slate-50 text-slate-700 ring-1 ring-slate-200">Cancel</button>
            <button type="button" onClick={sendInvite}
              disabled={name.trim().length < 2 || phone.replace(/\D/g, '').length !== 10}
              className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11.5px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50">
              <Send className="h-3 w-3" /> Send on WhatsApp
            </button>
          </div>
        </div>
      )}

      {/* Invited list */}
      {invites.length > 0 ? (
        <div className="mt-3 space-y-1.5">
          <p className="text-[10.5px] font-semibold text-slate-500 uppercase tracking-wide">Invited ({invites.length})</p>
          {invites.map((i) => (
            <div key={i.id} className="flex items-center gap-2 rounded-lg bg-slate-50/60 px-2 py-1.5 ring-1 ring-slate-100">
              <span className="h-7 w-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[11.5px] font-bold">
                {i.name.split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase()}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold text-slate-900 truncate">{i.name} <span className="text-slate-500 font-normal">· {i.relation}</span></p>
                <p className="text-[10.5px] text-slate-500">{i.phone.slice(0, 4)} {maskPhone(i.phone.slice(4))}</p>
              </div>
              <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md ${
                i.status === "accepted" ? "bg-emerald-100 text-emerald-700"
              : i.status === "delivered" ? "bg-surface-sunken text-accent"
              : "bg-amber-100 text-amber-700"
              }`}>
                {i.status === "accepted" ? <Check className="h-2.5 w-2.5" /> : <Clock className="h-2.5 w-2.5" />}
                {i.status}
              </span>
              <span className="text-[10px] text-slate-400">{tinyAgo(i.invitedAt)}</span>
              <button type="button" onClick={() => revoke(i.id)} aria-label="Revoke" className="text-slate-400 hover:text-rose-600">
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}
