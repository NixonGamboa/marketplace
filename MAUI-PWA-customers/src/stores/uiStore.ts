import { create } from 'zustand'

interface UIStore {
  mobileMenuOpen: boolean
  setMobileMenuOpen: (open: boolean) => void
  searchQuery: string
  setSearchQuery: (q: string) => void
  selectedCategoryId: string | undefined
  setSelectedCategoryId: (id: string | undefined) => void
  updateAvailable: boolean
  setUpdateAvailable: (v: boolean) => void
}

export const useUIStore = create<UIStore>((set) => ({
  mobileMenuOpen: false,
  setMobileMenuOpen: (open) => set({ mobileMenuOpen: open }),

  searchQuery: '',
  setSearchQuery: (q) => set({ searchQuery: q }),

  selectedCategoryId: undefined,
  setSelectedCategoryId: (id) => set({ selectedCategoryId: id }),

  updateAvailable: false,
  setUpdateAvailable: (v) => set({ updateAvailable: v }),
}))
