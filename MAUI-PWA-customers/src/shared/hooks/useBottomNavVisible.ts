import { useLocation } from 'react-router-dom'

const HIDDEN_PATHS = ['/checkout', '/auth', '/cart']

export function useBottomNavVisible(): boolean {
  const { pathname } = useLocation()
  return !HIDDEN_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))
}
