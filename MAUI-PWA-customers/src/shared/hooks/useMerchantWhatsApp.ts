import { useEffect, useState } from 'react'

const STORAGE_KEY = 'maui-admin-merchant'
const MERCHANT_ID = 'mch_lechemiel'
const PLACEHOLDER_NUMBER = '573000000000'

export function readMerchantWhatsApp(): string | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
    const merchant = (parsed as Record<string, unknown>)[MERCHANT_ID]
    if (typeof merchant !== 'object' || merchant === null || Array.isArray(merchant)) return null
    const value = (merchant as Record<string, unknown>).whatsapp
    if (typeof value !== 'string') return null
    if (!/^\+?[\d\s()-]+$/.test(value.trim())) return null
    const digits = value.replace(/\D/g, '')
    const phone = /^3\d{9}$/.test(digits) ? `57${digits}` : digits
    return /^573\d{9}$/.test(phone) && phone !== PLACEHOLDER_NUMBER ? phone : null
  } catch {
    return null
  }
}

export function merchantWhatsAppUrl(phone: string, message: string): string {
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
}

export function useMerchantWhatsApp(): string | null {
  const [phone, setPhone] = useState(readMerchantWhatsApp)

  useEffect(() => {
    const refresh = () => setPhone(readMerchantWhatsApp())
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) refresh()
    }

    refresh()
    window.addEventListener('storage', onStorage)
    window.addEventListener('focus', refresh)
    window.addEventListener('pageshow', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('pageshow', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])

  return phone
}
