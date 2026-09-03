/**
 * @spec CU-10, US-10, TASK-021
 * Gestión del catálogo. Lista + búsqueda + filter por categoría + toggle stock
 * inline + create/edit/delete con confirm. Solo owner (guardado en App.tsx).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Pencil, Trash2, Search, Boxes } from 'lucide-react'
import type { Category, Product } from '@/types/catalog'
import { catalogRepo } from '@/services'
import { useSession } from '@/auth/useSession'
import { useToast } from '@/ui/Toast'
import { Spinner } from '@/ui/Spinner'
import { EmptyState } from '@/ui/EmptyState'
import { ConfirmDialog } from '@/ui/ConfirmDialog'
import { StockToggle } from './StockToggle'
import { ProductFormModal } from './ProductFormModal'

const DEBOUNCE_MS = 150
const ALL = '__all__' as const

const currencyFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
})

export function CatalogoPage() {
  const { session } = useSession()
  const toast = useToast()
  const by = session?.user.email ?? 'demo'

  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [rawQuery, setRawQuery] = useState('')
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>(ALL)
  const [editing, setEditing] = useState<Product | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [pList, cList] = await Promise.all([
        catalogRepo.listProducts(),
        catalogRepo.listCategories(),
      ])
      setProducts(pList)
      setCategories(cList)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al cargar catálogo')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { load() }, [load])

  function handleQueryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    setRawQuery(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setQuery(val), DEBOUNCE_MS)
  }

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return products.filter((p) => {
      if (categoryFilter !== ALL && p.categoryId !== categoryFilter) return false
      if (needle && !p.name.toLowerCase().includes(needle)) return false
      return true
    })
  }, [products, query, categoryFilter])

  function openCreate() {
    setEditing(null)
    setModalOpen(true)
  }

  function openEdit(p: Product) {
    setEditing(p)
    setModalOpen(true)
  }

  function handleSaved(saved: Product) {
    setModalOpen(false)
    setEditing(null)
    // Optimista: reemplaza in-place o inserta
    setProducts((prev) => {
      const idx = prev.findIndex((p) => p.id === saved.id)
      if (idx >= 0) {
        const next = prev.slice()
        next[idx] = saved
        return next
      }
      return [...prev, saved].sort((a, b) => a.name.localeCompare(b.name))
    })
  }

  function updateInStock(id: string, next: boolean) {
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, inStock: next } : p)))
  }

  async function handleDelete() {
    if (!confirmDeleteId) return
    try {
      await catalogRepo.deleteProduct(confirmDeleteId, by)
      toast.success('Producto eliminado')
      setProducts((prev) => prev.filter((p) => p.id !== confirmDeleteId))
      setConfirmDeleteId(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar')
      setConfirmDeleteId(null)
    }
  }

  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-gray-900">Catálogo</h1>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition"
        >
          <Plus className="w-4 h-4" aria-hidden />
          Nuevo producto
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap items-end gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden />
          <input
            type="search"
            value={rawQuery}
            onChange={handleQueryChange}
            placeholder="Buscar por nombre"
            aria-label="Buscar productos"
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200"
          />
        </div>
        <div>
          <label htmlFor="cat-filter" className="block text-xs font-medium text-gray-600 mb-1">
            Categoría
          </label>
          <select
            id="cat-filter"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5"
          >
            <option value={ALL}>Todas ({products.length})</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-16">
          <Spinner size={28} />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Boxes size={40} />}
          title={query || categoryFilter !== ALL ? 'Sin resultados' : 'Catálogo vacío'}
          description="Crea el primer producto o ajusta el filtro."
        />
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Producto</th>
                <th className="text-left px-4 py-2 font-medium">Categoría</th>
                <th className="text-right px-4 py-2 font-medium">Precio</th>
                <th className="text-center px-4 py-2 font-medium">Stock</th>
                <th className="text-right px-4 py-2 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <div className="flex flex-col">
                      <span className="font-medium text-gray-800">{p.name}</span>
                      <span className="text-xs text-gray-400 font-mono">{p.id}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-gray-600">
                    {categoryMap.get(p.categoryId) ?? p.categoryId}
                  </td>
                  <td className="px-4 py-2 text-right text-gray-800">
                    {currencyFormatter.format(p.price)}
                    {p.is_variable_weight && <span className="text-xs text-orange-600 ml-1">/kg</span>}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <StockToggle
                      productId={p.id}
                      inStock={p.inStock}
                      by={by}
                      onChanged={(next) => updateInStock(p.id, next)}
                    />
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => openEdit(p)}
                      className="inline-flex items-center gap-1 text-xs px-2 py-1 text-indigo-700 hover:bg-indigo-50 rounded"
                    >
                      <Pencil className="w-3.5 h-3.5" aria-hidden />
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(p.id)}
                      className="inline-flex items-center gap-1 text-xs px-2 py-1 text-red-700 hover:bg-red-50 rounded ml-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden />
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ProductFormModal
        open={modalOpen}
        categories={categories}
        initial={editing ?? undefined}
        by={by}
        onSaved={handleSaved}
        onCancel={() => setModalOpen(false)}
      />

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Eliminar producto"
        message="Esta acción no se puede deshacer. ¿Continuar?"
        confirmLabel="Sí, eliminar"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  )
}
