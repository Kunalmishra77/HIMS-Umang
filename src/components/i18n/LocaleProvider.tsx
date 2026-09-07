"use client"

import { createContext, useCallback, useContext, useEffect, useState } from "react"
import { NextIntlClientProvider } from "next-intl"
import { setLocale as persistLocale } from "@/app/actions/locale"
import type { Locale } from "@/i18n/routing"
import en from "../../../messages/en"
import hi from "../../../messages/hi"

const BUNDLES = { en, hi } as const

// Umang Hospital is a single site in India. next-intl formats dates in this
// zone on both sides of the render, so a server running UTC (Vercel does) and
// a browser in IST produce the same markup — without it next-intl falls back
// to each environment's own zone and the timestamps hydrate mismatched.
const TIME_ZONE = 'Asia/Kolkata'

type LocaleContextValue = { locale: Locale; setLocale: (next: Locale) => void }

const LocaleContext = createContext<LocaleContextValue | null>(null)

/**
 * Client-side locale provider layered inside the server NextIntlClientProvider.
 * Switching updates React state instantly (no reload, no lost flow state) and
 * fire-and-forgets the cookie so the choice persists for SSR and the rest of the
 * platform. Adding a language = drop a messages/<lng>.json and list it here + in
 * i18n/routing.ts.
 */
export function LocaleProvider({ initialLocale, children }: { initialLocale: Locale; children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale)

  const setLocale = useCallback((next: Locale) => {
    if (next === locale) return
    setLocaleState(next)
    void persistLocale(next)
  }, [locale])

  useEffect(() => { document.documentElement.lang = locale }, [locale])

  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      <NextIntlClientProvider locale={locale} messages={BUNDLES[locale]} timeZone={TIME_ZONE}>
        {children}
      </NextIntlClientProvider>
    </LocaleContext.Provider>
  )
}

export function useSetLocale() {
  const ctx = useContext(LocaleContext)
  if (!ctx) throw new Error("useSetLocale must be used within LocaleProvider")
  return ctx
}
