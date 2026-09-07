import { getRequestConfig } from 'next-intl/server'
import { cookies } from 'next/headers'
import en from '../../messages/en'
import hi from '../../messages/hi'

const MESSAGES = { en, hi } as const

export default getRequestConfig(async () => {
  const cookieStore = await cookies()
  const locale = (cookieStore.get('locale')?.value as 'en' | 'hi') ?? 'en'

  return {
    locale,
    messages: MESSAGES[locale],
    // Umang Hospital is a single site in India. Pinning the zone keeps server
    // rendering (Vercel runs UTC) and the browser formatting the same instant,
    // which is what prevents date/time hydration mismatches.
    timeZone: 'Asia/Kolkata',
  }
})
