/**
 * @spec CU-11, US-11, TASK-022
 * CRUD simple de Category (id, name, slug, order). Solo owner.
 * `deleteCategory` es bloqueado por el repo si hay productos asignados (RN-7).
 */
import { useCallback, useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Save, X, FolderTree } from 'lucide-react'
import type { Category } from '@/types/catalog'
import { catalogRepo } from '@/services'
import { useSession } from '@/auth/useSession'
import { useToast } from '@/ui/Toast'
import { Spinner } from '@/ui/Spinner'
import { EmptyState } from '@/ui/EmptyState'
import { ConfirmDialog } from '@/ui/ConfirmDialog'

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

interface EditorState {
  mode: 'idle' | 'creating' | 'editing'
  draft: Category
}

const EMPTY_DRAFT: Category = { id: '', name: '', slug: '', order: 0 }

export function CategoriasPage() {
  const { session } = useSession()
  const toast = useToast()
  const by = session?.user.email ?? 'demo'

  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [editor, setEditor] = useState<EditorState>({ mode: 'idle', draft: EMPTY_DRAFT })
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await catalogRepo.listCategories()
      setCategories(list)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al cargar categorías')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { load() }, [load])

  function startCreate() {
    setEditor({
      mode: 'creating',
      draft: { ...EMPTY_DRAFT, order: categories.length + 1 },
    })
  }

  function startEdit(c: Category) {
    setEditor({ mode: 'editing', draft: { ...c } })
  }

  function cancelEditor() {
    setEditor({ mode: 'idle', draft: EMPTY_DRAFT })
  }

  async function handleSave() {
    const draft = { ...editor.draft }
    if (!draft.name.trim()) {
      toast.error('El nombre es obligatorio')
      return
    }
    if (editor.mode === 'creating') {
      draft.id = draft.id || slugify(draft.name)
      draft.slug = draft.slug || slugify(draft.name)
      if (categories.some((c) => c.id === draft.id)) {
        toast.error(`Ya existe una categoría con id "${draft.id}"`)
        return
      }
    }
    setBusy(true)
    try {
      await catalogRepo.upsertCategory(draft, by)
      toast.success(editor.mode === 'creating' ? 'Categoría creada' : 'Categoría actualizada')
      cancelEditor()
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (!confirmDeleteId) return
    setBusy(true)
    try {
      await catalogRepo.deleteCategory(confirmDeleteId, by)
      toast.success('Categoría eliminada')
      setConfirmDeleteId(null)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar')
      setConfirmDeleteId(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Categorías</h1>
        <button
          type="button"
          onClick={startCreate}
          disabled={editor.mode !== 'idle'}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition"
        >
          <Plus className="w-4 h-4" aria-hidden />
          Nueva
        </button>
      </div>

      {editor.mode !== 'idle' && (
        <CategoryEditor
          draft={editor.draft}
          mode={editor.mode}
          busy={busy}
          onChange={(patch) => setEditor((prev) => ({ ...prev, draft: { ...prev.draft, ...patch } }))}
          onSave={handleSave}
          onCancel={cancelEditor}
        />
      )}

      {loading ? (
        <div className="flex justify-center items-center py-16">
          <Spinner size={28} />
        </div>
      ) : categories.length === 0 ? (
        <EmptyState
          icon={<FolderTree size={40} />}
          title="Sin categorías"
          description="Crea la primera categoría para empezar."
        />
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Orden</th>
                <th className="text-left px-4 py-2 font-medium">Nombre</th>
                <th className="text-left px-4 py-2 font-medium">Slug</th>
                <th className="text-right px-4 py-2 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {categories.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-500">{c.order ?? '—'}</td>
                  <td className="px-4 py-2 font-medium text-gray-800">{c.name}</td>
                  <td className="px-4 py-2 font-mono text-xs text-gray-500">{c.slug ?? c.id}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => startEdit(c)}
                      className="inline-flex items-center gap-1 text-xs px-2 py-1 text-indigo-700 hover:bg-indigo-50 rounded"
                    >
                      <Pencil className="w-3.5 h-3.5" aria-hidden />
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(c.id)}
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

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Eliminar categoría"
        message="Si tiene productos asignados, la eliminación fallará. ¿Continuar?"
        confirmLabel="Sí, eliminar"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  )
}

function CategoryEditor({
  draft,
  mode,
  busy,
  onChange,
  onSave,
  onCancel,
}: {
  draft: Category
  mode: 'creating' | 'editing'
  busy: boolean
  onChange(patch: Partial<Category>): void
  onSave(): void
  onCancel(): void
}) {
  return (
    <div className="bg-white border border-indigo-200 rounded-xl p-4 space-y-3">
      <p className="text-sm font-semibold text-indigo-700">
        {mode === 'creating' ? 'Nueva categoría' : `Editar "${draft.name}"`}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="cat-name">Nombre</label>
          <input
            id="cat-name"
            value={draft.name}
            onChange={(e) => onChange({ name: e.target.value })}
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="cat-slug">Slug</label>
          <input
            id="cat-slug"
            value={draft.slug ?? ''}
            onChange={(e) => onChange({ slug: e.target.value })}
            placeholder="derivado del nombre"
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 font-mono"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="cat-order">Orden</label>
          <input
            id="cat-order"
            type="number"
            value={draft.order ?? 0}
            onChange={(e) => onChange({ order: Number.parseInt(e.target.value, 10) || 0 })}
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg"
        >
          <X className="w-3.5 h-3.5" aria-hidden /> Cancelar
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={busy}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg"
        >
          <Save className="w-3.5 h-3.5" aria-hidden /> Guardar
        </button>
      </div>
    </div>
  )
}
