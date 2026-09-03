/**
 * @spec §8 — Tabs controlados.
 * Sin focus-ring morado: se usa border + tint + shadow + transición (ADR memoria PWA).
 */

interface TabItem {
  value: string
  label: string
  badge?: number
}

interface TabsProps {
  items: TabItem[]
  value: string
  onChange(value: string): void
}

export function Tabs({ items, value, onChange }: TabsProps) {
  return (
    <div
      role="tablist"
      className="flex gap-1 overflow-x-auto border-b border-gray-200 pb-0"
    >
      {items.map((item) => {
        const isActive = item.value === value
        return (
          <button
            key={item.value}
            role="tab"
            type="button"
            aria-selected={isActive}
            onClick={() => onChange(item.value)}
            className={[
              'relative flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-all',
              'focus-visible:outline-none',
              isActive
                ? [
                    'text-indigo-700',
                    'after:absolute after:bottom-0 after:inset-x-0 after:h-0.5 after:bg-indigo-600 after:rounded-t',
                    'border border-indigo-200 border-b-transparent rounded-t-lg bg-indigo-50 shadow-sm',
                  ].join(' ')
                : 'text-gray-500 hover:text-gray-800 border border-transparent hover:border-gray-200 rounded-t-lg hover:bg-gray-50',
            ].join(' ')}
          >
            {item.label}
            {item.badge !== undefined && (
              <span
                className={`inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full text-xs font-semibold ${
                  isActive ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-600'
                }`}
              >
                {item.badge}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
