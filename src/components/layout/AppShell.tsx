"use client"

import { usePathname, useRouter } from "next/navigation"
import Link from "next/link"
import { motion, AnimatePresence, useReducedMotion } from "framer-motion"
import {
  Activity, BarChart3, Bell, Calendar, ClipboardList,
  FileText, Home, LogOut, Settings, Users, Stethoscope,
  LayoutDashboard, Receipt, UserCog,
  Search, PanelLeftClose, PanelLeft,
  Package, ScanLine, X,
  CreditCard, HeartPulse,
  Heart, AlertTriangle,
  Sparkles, ChevronRight, MessageSquare, MessageSquarePlus, Menu,
  UserPlus,
} from "lucide-react"
import { useAuthStore, type Role } from "@/store/useAuthStore"
import { usePatientStore } from "@/store/usePatientStore"
import { useInpatientStore } from "@/store/useInpatientStore"
import { useNotificationStore } from "@/store/useNotificationStore"
import { Avatar } from "@/components/ui/avatar"
import { LocaleToggle } from "@/components/ui/LocaleToggle"
import { CommandPalette, CommandPaletteTrigger } from "@/components/layout/CommandPalette"
import { CriticalValueBanner } from "@/components/clinical/CriticalValueBanner"
import { useState } from "react"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import { useIsMounted } from '@/lib/useIsMounted'
import Image from "next/image"

type NavItem = { href: string; label: string; icon: React.ElementType }

const PATIENT_SECTIONS: { header: string; items: NavItem[] }[] = [
  { header: 'section.care', items: [
    { href: '/patient/dashboard',    label: 'item.patient_dashboard',    icon: Home },
    { href: '/patient/ai-care',      label: 'item.patient_ai_care',      icon: Sparkles },
    { href: '/patient/health-story', label: 'item.patient_health_story', icon: Activity },
  ] },
  { header: 'section.consultations', items: [
    { href: '/patient/consultations', label: 'item.patient_consultations', icon: Calendar },
    { href: '/patient/orders',        label: 'item.patient_orders',        icon: ClipboardList },
  ] },
  { header: 'section.records_billing', items: [
    { href: '/patient/downloads', label: 'item.patient_downloads', icon: FileText },
    { href: '/patient/billing',   label: 'item.patient_billing',   icon: Receipt },
  ] },
  { header: 'section.experience', items: [
    { href: '/patient/feedback', label: 'item.patient_feedback', icon: MessageSquarePlus },
  ] },
  { header: 'section.account', items: [
    { href: '/patient/followup', label: 'item.patient_followup', icon: HeartPulse },
    { href: '/patient/profile',  label: 'item.patient_profile',  icon: UserCog },
    { href: '/patient/help',     label: 'item.patient_help',     icon: AlertTriangle },
  ] },
]

// Reception = front-desk command center. Owns the front-desk workflow;
// surfaces read-only "visibility" windows into other modules; shared utilities.
const RECEPTION_SECTIONS: { header: string; items: NavItem[] }[] = [
  { header: 'section.front_desk', items: [
    { href: '/reception/dashboard',    label: 'item.reception_dashboard',    icon: Home },
    { href: '/reception/opd',          label: 'item.reception_opd',          icon: LayoutDashboard },
    { href: '/reception/register',     label: 'item.reception_register',     icon: UserPlus },
    { href: '/reception/journey',      label: 'item.reception_journey',      icon: Activity },
    { href: '/reception/queue',        label: 'item.reception_queue',        icon: Activity },
    { href: '/reception/appointments', label: 'item.reception_appointments', icon: Calendar },
    { href: '/reception/patients',     label: 'item.reception_patients',     icon: Users },
  ] },
  { header: 'section.coordination', items: [
    { href: '/reception/billing',     label: 'item.reception_billing',     icon: CreditCard },
  ] },
  { header: 'section.utilities', items: [
    { href: '/reception/messages',  label: 'item.reception_messages',  icon: MessageSquare },
    { href: '/reception/downloads', label: 'item.reception_downloads', icon: FileText },
    { href: '/reception/reports',   label: 'item.reception_reports',   icon: BarChart3 },
    { href: '/checkin',             label: 'item.reception_checkin',   icon: ScanLine },
    { href: '/reception/setup',     label: 'item.reception_setup',     icon: Settings },
  ] },
]

const DOCTOR_SECTIONS: { header: string; items: NavItem[] }[] = [
  { header: 'section.clinical', items: [
    { href: '/doctor/dashboard',   label: 'item.doctor_dashboard',   icon: Stethoscope },
  ] },
  { header: 'patients', items: [
    { href: '/doctor/records',     label: 'item.doctor_records',      icon: ClipboardList },
    { href: '/doctor/ai-assistant',label: 'item.doctor_ai_assistant', icon: Sparkles },
  ] },
  { header: 'section.workspace', items: [
    { href: '/doctor/schedule',    label: 'item.doctor_schedule', icon: Calendar },
    { href: '/doctor/inbox',       label: 'item.doctor_inbox',    icon: MessageSquare },
  ] },
  { header: 'section.insights', items: [
    { href: '/doctor/analytics',   label: 'item.doctor_analytics',  icon: BarChart3 },
  ] },
]

const navByRole: Record<Role, NavItem[]> = {
  patient: PATIENT_SECTIONS.flatMap(s => s.items),
  doctor: DOCTOR_SECTIONS.flatMap(s => s.items),
  reception: RECEPTION_SECTIONS.flatMap(s => s.items),
  nurse: [
    { href: '/nurse/dashboard',       label: 'item.nurse_dashboard',       icon: LayoutDashboard },
    { href: '/nurse/vitals-requests', label: 'item.nurse_vitals_requests', icon: HeartPulse },
    { href: '/nurse/patients',        label: 'item.nurse_patients',        icon: Users },
    { href: '/nurse/tasks',           label: 'item.nurse_tasks',           icon: ClipboardList },
    { href: '/nurse/ai-assistant',    label: 'item.nurse_ai_assistant',    icon: Sparkles },
    { href: '/nurse/messages',        label: 'item.nurse_messages',        icon: MessageSquare },
  ],
  billing: [
    { href: '/billing/dashboard', label: 'item.billing_dashboard', icon: CreditCard },
    { href: '/billing/packages',  label: 'item.billing_packages',  icon: Package },
    { href: '/billing/refunds',   label: 'item.billing_refunds',   icon: Receipt },
    { href: '/billing/discounts', label: 'item.billing_discounts', icon: Heart },
  ],
  // `admin` ships no portal — see src/types/roles.ts.
  admin: [],
}

// Single disciplined deep-blue identity shared by every portal (uniform per design
// direction). Roles are distinguished by label + icon only — never by color.
const ROLE_LABELS: Record<Role, string> = {
  patient:   'role.patient',
  doctor:    'role.doctor',
  reception: 'role.reception',
  nurse:     'role.nurse',
  billing:   'role.billing',
  admin:     'role.admin',
}

// Roles whose sidebar is rendered as grouped sections (with headers) instead of a flat list.
const sectionsByRole: Partial<Record<Role, { header: string; items: NavItem[] }[]>> = {
  patient: PATIENT_SECTIONS,
  reception: RECEPTION_SECTIONS,
  doctor: DOCTOR_SECTIONS,
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { currentUser, activeRole, logout } = useAuthStore()
  const pathname = usePathname()
  const router = useRouter()
  const t = useTranslations('nav')
  const nav = navByRole[activeRole] ?? []
  const roleLabel = t(ROLE_LABELS[activeRole])
  const [collapsed, setCollapsed] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const mounted = useIsMounted()
  const [query, setQuery] = useState('')
  // The drawer is remembered as "open on this route" rather than a bare
  // boolean, so navigating away closes it by derivation instead of via an
  // effect that would setState during the render after every route change.
  const [openOnPath, setOpenOnPath] = useState<string | null>(null)
  const mobileOpen = openOnPath === pathname
  const setMobileOpen = (open: boolean) => setOpenOnPath(open ? pathname : null)
  const shouldReduceMotion = useReducedMotion()

  // Wired header search + bell (M16).
  const allPatients = usePatientStore(s => s.patients)
  const allInpatients = useInpatientStore(s => s.inpatients)
  const notifications = useNotificationStore(s => s.notifications)
  const markNotifRead = useNotificationStore(s => s.markRead)
  const markAllRead = useNotificationStore(s => s.markAllRead)
  const dismissNotif = useNotificationStore(s => s.dismiss)

  const roleNotifs = notifications.filter(n => activeRole === 'admin' || !n.targetRole || n.targetRole === activeRole)
  const unreadCount = roleNotifs.filter(n => !n.read).length

  // Where clicking a notification takes the user. Prefers an explicit deep-link,
  // then a keyword/type match for the active role, then the role's home page so
  // a click always lands somewhere actionable.
  const notifHref = (n: typeof notifications[number]): string | null => {
    if (n.link) return n.link
    const t = `${n.type} ${n.title} ${n.body}`.toLowerCase()
    if (activeRole === 'doctor') {
      if (/radiolog|x-ray|ct |mri|scan|lab|result|critical|report/.test(t)) return '/doctor/inbox'
      if (/appointment|consult|opd/.test(t)) return '/doctor/dashboard'
    }
    return nav[0]?.href ?? null
  }

  const handleNotifClick = (n: typeof notifications[number]) => {
    markNotifRead(n.id)
    setNotifOpen(false)
    const href = notifHref(n)
    if (href) router.push(href)
  }

  const q = query.trim().toLowerCase()
  const searchResults = q.length >= 1 ? (() => {
    const ipIds = new Set(allInpatients.map(i => i.patientId))
    const out: { id: string; name: string; sub: string; admitted: boolean }[] = []
    allInpatients.forEach(i => { if (i.name.toLowerCase().includes(q) || i.patientId.toLowerCase().includes(q)) out.push({ id: i.patientId, name: i.name, sub: `Admitted · ${i.ward} ${i.bed}`, admitted: true }) })
    allPatients.forEach(p => { if (!out.some(m => m.id === p.id) && (p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q))) out.push({ id: p.id, name: p.name, sub: `${p.id} · ${p.department}`, admitted: ipIds.has(p.id) }) })
    return out.slice(0, 6)
  })() : []

  const PATIENTS_ROUTE: Partial<Record<Role, string>> = { reception: '/reception/patients', nurse: '/nurse/patients' }
  const gotoPatient = () => {
    setQuery('')
    if (activeRole === 'doctor') { router.push('/doctor/records'); return }
    const dest = PATIENTS_ROUTE[activeRole]; if (dest) router.push(dest)
  }

  const handleLogout = () => {
    logout()
    router.push('/')
  }

  const transition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.28, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }

  const renderItem = (item: NavItem) => {
    // Exact match wins; prefix match only when no more-specific nav item also matches,
    // preventing a shared root route from staying active on every sub-page.
    const isActive =
      pathname === item.href ||
      (pathname.startsWith(item.href + '/') &&
        !nav.some(other => other.href !== item.href && pathname.startsWith(other.href)))
    const Icon = item.icon
    const label = t(item.label)
    return (
      <Link key={item.href} href={item.href}>
        <div
          title={collapsed ? label : undefined}
          aria-current={isActive ? 'page' : undefined}
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 cursor-pointer relative group",
            isActive
              ? "font-semibold bg-accent-soft text-accent"
              : "font-medium text-foreground-lighter hover:text-foreground"
          )}
        >
          {isActive && <motion.div layoutId="active-nav-pill" className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-primary" />}
          {!isActive && <div className="absolute inset-0 rounded-xl bg-surface-sunken opacity-0 group-hover:opacity-100 transition-opacity duration-150" />}
          <Icon className={cn("h-[18px] w-[18px] flex-shrink-0 relative z-10 transition-colors", isActive && "text-accent")} aria-hidden="true" />
          {!collapsed && <span className="flex-1 truncate relative z-10">{label}</span>}
          {isActive && !collapsed && <ChevronRight className="h-3.5 w-3.5 relative z-10 opacity-50 text-accent" />}
        </div>
      </Link>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <a href="#main-content" className="skip-link">{t('chrome.skipToContent')}</a>

      {/* Mobile drawer backdrop */}
      {mobileOpen && <div className="lg:hidden fixed inset-0 bg-foreground/40 backdrop-blur-[2px] z-40" onClick={() => setMobileOpen(false)} aria-hidden="true" />}

      {/* ── Sidebar ──────────────────────────────────────── */}
      <motion.aside
        animate={{ width: collapsed ? 72 : 264 }}
        transition={transition}
        className={cn(
          "flex-shrink-0 flex flex-col bg-surface border-r border-border z-20 relative overflow-hidden",
          "max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:z-50 max-lg:w-64 max-lg:shadow-lg transition-transform",
          mobileOpen ? "max-lg:translate-x-0" : "max-lg:-translate-x-full",
        )}
        aria-label={t('chrome.mainSidebar')}
      >
        {/* Brand Header */}
        <div className="h-[68px] flex items-center px-4 flex-shrink-0 border-b border-border-light">
          <div className="flex items-center overflow-hidden whitespace-nowrap w-full pl-2">
            <Image src="/Umang-logo.webp" alt="Umang Hospital" width={726} height={208} priority className={cn("w-auto object-contain", collapsed ? "h-8" : "h-10")} />
          </div>
        </div>

        {/* Navigation */}
        <nav aria-label={t('chrome.mainNavigation')} className="flex-1 px-2.5 py-4 overflow-y-auto">
          {sectionsByRole[activeRole] ? (
            sectionsByRole[activeRole]!.map(section => (
              <div key={section.header} className="mb-1">
                {!collapsed && <p className="px-3 pt-3 pb-1 t-overline text-foreground-placeholder">{t(section.header)}</p>}
                <div className="space-y-0.5">{section.items.map(renderItem)}</div>
              </div>
            ))
          ) : (
            <div className="space-y-0.5">{nav.map(renderItem)}</div>
          )}
        </nav>

        {/* Bottom: Role Switcher + User */}
        <div className="px-2.5 pb-4 flex flex-col gap-2 pt-3 border-t border-border-light">
          {/* AI Status Chip */}
          {!collapsed && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-accent-soft border border-primary/15">
              <Sparkles className="h-3.5 w-3.5 flex-shrink-0 text-accent" />
              <span className="text-[11px] font-semibold text-accent">{t('chrome.aiActive')}</span>
              <div className="ml-auto h-1.5 w-1.5 rounded-full bg-success" />
            </div>
          )}

          {/* User Row */}
          <div className={cn("flex items-center", collapsed ? "justify-center flex-col gap-2" : "gap-3 px-1")}>
            <Avatar name={currentUser?.name ?? t('chrome.userFallback')} size="sm" />
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-foreground truncate">{currentUser?.name}</p>
                <p className="text-[11px] font-medium text-foreground-placeholder truncate">{currentUser?.id}</p>
              </div>
            )}
            <button
              onClick={handleLogout}
              aria-label={t('chrome.logout')}
              title={t('chrome.logout')}
              className="tap p-1.5 rounded-lg transition-colors flex-shrink-0 cursor-pointer text-foreground-placeholder hover:text-danger hover:bg-danger-bg"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </motion.aside>

      {/* ── Main Area ────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {/* Top Header — z-30 keeps its dropdowns (notifications, search) above the
            page content in <main> (z-10) and the sidebar (z-20); equal z-index
            previously let <main> paint over the open notification panel. */}
        <header className="h-[68px] flex-shrink-0 flex items-center justify-between px-4 sm:px-6 bg-surface border-b border-border relative z-30">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setMobileOpen(true)}
              aria-label={t('chrome.openMenu')}
              className="lg:hidden tap p-2 -ml-2 rounded-xl transition-colors cursor-pointer text-foreground-lighter hover:bg-surface-sunken hover:text-foreground"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
            <button
              onClick={() => setCollapsed(!collapsed)}
              aria-label={collapsed ? t('chrome.expandSidebar') : t('chrome.collapseSidebar')}
              className="hidden lg:block p-2 -ml-2 rounded-xl transition-colors cursor-pointer text-foreground-placeholder hover:text-foreground hover:bg-surface-sunken"
            >
              {collapsed
                ? <PanelLeft className="h-5 w-5" aria-hidden="true" />
                : <PanelLeftClose className="h-5 w-5" aria-hidden="true" />
              }
            </button>
            <div>
              <h1 className="t-title text-foreground">
                {pathname.startsWith('/doctor/settings')
                  ? t('chrome.profileSettings')
                  : (() => { const active = nav.find(n => pathname.startsWith(n.href)); return active ? t(active.label) : t('chrome.defaultTitle') })()}
              </h1>
              <nav aria-label={t('chrome.breadcrumb')}>
                <ol className="flex items-center gap-1 text-xs font-medium text-foreground-placeholder">
                  <li>{roleLabel}</li>
                  {nav.find(n => pathname.startsWith(n.href)) && (
                    <>
                      <li aria-hidden="true">/</li>
                      <li aria-current="page" className="font-semibold text-accent">
                        {t(nav.find(n => pathname.startsWith(n.href))!.label)}
                      </li>
                    </>
                  )}
                </ol>
              </nav>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Mobile search — below md the desktop bar is hidden. Opens the
                universal command palette. */}
            <button
              type="button"
              onClick={() => {
                if (typeof window === "undefined") return
                window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, ctrlKey: true, bubbles: true }))
              }}
              aria-label={t('chrome.search')}
              className="md:hidden tap inline-flex items-center justify-center p-2 rounded-xl text-foreground-muted hover:bg-surface-sunken transition-colors cursor-pointer"
            >
              <Search className="h-5 w-5" aria-hidden="true" />
            </button>

            {/* M2 — Command palette trigger (Cmd/Ctrl+K). */}
            <CommandPaletteTrigger className="hidden lg:inline-flex" />

            {/* Global Search */}
            <div className="relative hidden md:block w-56">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground-placeholder z-10" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && searchResults[0]) gotoPatient(); if (e.key === 'Escape') setQuery('') }}
                onBlur={() => setTimeout(() => setQuery(''), 150)}
                placeholder={activeRole === 'patient' ? t('chrome.searchRecordsPlaceholder') : t('chrome.searchPatientsPlaceholder')}
                aria-label={t('chrome.search')}
                className="w-full h-9 pl-9 pr-4 rounded-xl text-sm text-foreground placeholder:text-foreground-placeholder bg-surface-sunken border border-border hover:border-border-hover focus:border-primary focus:bg-surface transition-colors"
              />
              {searchResults.length > 0 && (
                <div className="absolute left-0 right-0 top-11 w-72 bg-surface border border-border rounded-2xl z-50 overflow-hidden py-1.5 shadow-dropdown">
                  {searchResults.map(m => (
                    <button key={m.id} onMouseDown={e => e.preventDefault()} onClick={() => gotoPatient()}
                      className="w-full text-left px-3.5 py-2 hover:bg-surface-sunken flex items-center justify-between gap-2 transition-colors">
                      <span className="min-w-0"><span className="block text-[13px] font-semibold text-foreground truncate">{m.name}</span><span className="block text-[11px] text-foreground-placeholder truncate">{m.sub}</span></span>
                      {m.admitted && <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-danger-bg text-danger-strong flex-shrink-0">IPD</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Notifications */}
            <div className="relative">
              <button
                onClick={() => setNotifOpen(!notifOpen)}
                aria-label={t('chrome.notifications')}
                aria-expanded={notifOpen}
                className="tap relative p-2 rounded-xl transition-colors cursor-pointer bg-surface-sunken border border-border text-foreground-lighter shadow-xs hover:bg-surface hover:text-foreground"
              >
                <Bell className="h-4 w-4" aria-hidden="true" />
                {unreadCount > 0 && <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-danger text-white text-[9px] font-bold flex items-center justify-center ring-2 ring-surface" aria-label={t('chrome.unreadNotifications', { count: unreadCount })}>{unreadCount}</span>}
              </button>
              <AnimatePresence>
                {notifOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.96 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-12 w-72 bg-surface border border-border rounded-2xl z-50 overflow-hidden shadow-dropdown"
                  >
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-border-light">
                      <p className="text-sm font-bold text-foreground flex-1">{t('chrome.notifications')}{unreadCount > 0 ? ` · ${unreadCount}` : ''}</p>
                      {unreadCount > 0 ? (
                        <button onClick={() => activeRole && markAllRead(activeRole)} className="text-[10.5px] font-semibold text-accent px-2 py-1 rounded-md hover:bg-accent-soft cursor-pointer transition-colors">
                          {t('chrome.markAllRead')}
                        </button>
                      ) : null}
                      <button onClick={() => setNotifOpen(false)} aria-label={t('chrome.close')} className="p-1 rounded-lg hover:bg-surface-sunken cursor-pointer">
                        <X className="h-4 w-4 text-foreground-placeholder" />
                      </button>
                    </div>
                    {roleNotifs.length === 0 ? (
                      <div className="p-6 text-center text-sm text-foreground-lighter">{t('chrome.allCaughtUp')}</div>
                    ) : (
                      <div className="max-h-80 overflow-y-auto">
                        {roleNotifs.slice(0, 12).map(n => (
                          <div key={n.id}
                            className={cn("w-full text-left px-4 py-2.5 border-b border-border-light last:border-0 hover:bg-surface-sunken flex items-start gap-2.5 group cursor-pointer transition-colors", !n.read && "bg-accent-soft/50")}
                            onClick={() => handleNotifClick(n)}>
                            {!n.read ? <span className={cn("h-2 w-2 rounded-full mt-1.5 flex-shrink-0", n.priority === 'critical' ? "bg-danger" : n.priority === 'high' ? "bg-warning" : "bg-primary")} /> : <span className="w-2 flex-shrink-0" />}
                            <span className="min-w-0 flex-1">
                              <span className="block text-[12.5px] font-semibold text-foreground truncate">{n.title}</span>
                              <span className="block text-[11.5px] text-foreground-lighter line-clamp-2">{n.body}</span>
                              {n.patientName ? <span className="block text-[10px] font-mono text-foreground-placeholder mt-0.5">{n.patientName}</span> : null}
                            </span>
                            <button onClick={(e) => { e.stopPropagation(); dismissNotif(n.id) }}
                              aria-label={t('chrome.dismiss')}
                              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-danger-bg text-foreground-placeholder hover:text-danger flex-shrink-0">
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <LocaleToggle />

            <Link href={activeRole === 'patient' ? '/patient/settings' : activeRole === 'reception' ? '/reception/setup' : activeRole === 'doctor' ? '/doctor/settings' : nav[0]?.href ?? '/'}>
              <button
                aria-label={t('chrome.settingsLabel')}
                className="tap p-2 rounded-xl transition-colors cursor-pointer bg-surface-sunken border border-border text-foreground-lighter shadow-xs hover:bg-surface hover:text-foreground"
              >
                <Settings className="h-4 w-4" aria-hidden="true" />
              </button>
            </Link>
          </div>
        </header>

        {/* Page Content */}
        <main id="main-content" className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 pb-8 pt-6 relative z-10">
          {/* M4-W1 — Closed-loop critical-value banner. Visible only when
              an unack'd lab_critical_callback exists, and only on the
              roles that own the loop (doctor, nurse). */}
          {activeRole === 'nurse' ? (
            <div className="max-w-7xl mx-auto mb-3">
              <CriticalValueBanner role="nurse" />
            </div>
          ) : null}

          {mounted ? (
            <AnimatePresence mode="wait">
              <motion.div
                key={pathname}
                initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: -8 }}
                transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.18, ease: 'easeOut' as const }}
                className="h-full max-w-7xl mx-auto"
              >
                {children}
              </motion.div>
            </AnimatePresence>
          ) : (
            <div className="h-full max-w-7xl mx-auto">{children}</div>
          )}
        </main>
      </div>
      {/* M2 — Command palette: Cmd/Ctrl+K from anywhere in the app. */}
      <CommandPalette />
    </div>
  )
}
