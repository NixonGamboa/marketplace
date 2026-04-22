import { useUIStore } from '@/stores/uiStore'

export function useSearch() {
  const searchQuery = useUIStore((s) => s.searchQuery)
  const setSearchQuery = useUIStore((s) => s.setSearchQuery)
  return { searchQuery, setSearchQuery }
}
