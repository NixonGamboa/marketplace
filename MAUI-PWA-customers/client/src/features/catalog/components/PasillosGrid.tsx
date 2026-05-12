import { useRef, type KeyboardEvent } from 'react'
import { LayoutGrid } from 'lucide-react'
import type { Category } from '@/types'

interface PasillosGridProps {
  categories: Category[]
  onSelect: (category: Category) => void
  selectedId?: string
  className?: string
}

export function PasillosGrid({ categories, onSelect, selectedId, className = '' }: PasillosGridProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>, idx: number) => {
    const cols = window.innerWidth >= 1024 ? 6 : window.innerWidth >= 640 ? 5 : 3
    let next: number | null = null

    if (e.key === 'ArrowRight') next = Math.min(idx + 1, categories.length - 1)
    else if (e.key === 'ArrowLeft') next = Math.max(idx - 1, 0)
    else if (e.key === 'ArrowDown') next = Math.min(idx + cols, categories.length - 1)
    else if (e.key === 'ArrowUp') next = Math.max(idx - cols, 0)

    if (next !== null) {
      e.preventDefault()
      refs.current[next]?.focus()
    }
  }

  return (
    <div
      role="listbox"
      aria-label="Pasillos del mercado"
      className={['grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-6 gap-3', className].join(' ')}
    >
      {categories
        .slice()
        .sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
        .map((cat, idx) => {
          const isSelected = cat.id === selectedId
          return (
            <button
              key={cat.id}
              ref={(el) => { refs.current[idx] = el }}
              role="option"
              aria-selected={isSelected}
              onClick={() => onSelect(cat)}
              onKeyDown={(e) => handleKeyDown(e, idx)}
              className={[
                'flex flex-col items-center gap-2 rounded-xl p-3 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2',
                isSelected
                  ? 'bg-brand-primary text-white shadow-brand-sm'
                  : 'bg-brand-surface border border-brand-border text-brand-dark hover:border-brand-primary hover:bg-green-50',
              ].join(' ')}
            >
              {cat.illustrationUrl ? (
                <img
                  src={cat.illustrationUrl}
                  alt=""
                  aria-hidden="true"
                  className="w-10 h-10 object-contain select-none"
                  draggable={false}
                />
              ) : (
                <LayoutGrid
                  size={32}
                  aria-hidden="true"
                  className={isSelected ? 'text-white' : 'text-brand-primary'}
                />
              )}
              <span className="text-xs font-medium leading-tight line-clamp-2">{cat.name}</span>
            </button>
          )
        })}
    </div>
  )
}
