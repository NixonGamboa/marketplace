/**
 * @spec CU-10, TASK-021
 * Modal para crear o editar Product. Campos mínimos: id, name, price, unit, imageUrl,
 * categoryId, inStock, is_variable_weight.
 */
import { useEffect, useState } from 'react'
import type { Category, Product } from '@/types/catalog'
import { catalogRepo } from '@/services'
import { Modal } from '@/ui/Modal'
import { PriceInput } from '@/ui/PriceInput'
import { useToast } from '@/ui/Toast'

interface ProductFormModalProps {
  open: boolean
  categories: Category[]
  initial?: Product
  by: string
  onSaved(p: Product): void
  onCancel(): void
}

const PICSUM = (seed: string) => `https://picsum.photos/seed/${seed || 'p'}/240/240`

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function emptyDraft(categoryId: string): Product {
  return {
    id: '',
    name: '',
    price: 0,
    unit: '1 u',
    imageUrl: '',
    categoryId,
    inStock: true,
    is_variable_weight: false,
  }
}

export function ProductFormModal({
  open,
  categories,
  initial,
  by,
  onSaved,
  onCancel,
}: ProductFormModalProps) {
  const toast = useToast()
  const [draft, setDraft] = useState<Product>(() => initial ?? emptyDraft(categories[0]?.id ?? ''))
  const [busy, setBusy] = useState(false)
  const isEditing = !!initial

  useEffect(() => {
    if (open) {
      setDraft(initial ?? emptyDraft(categories[0]?.id ?? ''))
    }
  }, [open, initial, categories])

  function patch(p: Partial<Product>) {
    setDraft((prev) => ({ ...prev, ...p }))
  }

  async function handleSave() {
    if (!draft.name.trim()) {
      toast.error('El nombre es obligatorio')
      return
    }
    if (draft.price < 0) {
      toast.error('El precio no puede ser negativo')
      return
    }
    if (!draft.categoryId) {
      toast.error('Elige una categoría')
      return
    }
    const finalDraft: Product = {
      ...draft,
      id: draft.id || slugify(draft.name),
      imageUrl: draft.imageUrl || PICSUM(draft.id || slugify(draft.name)),
    }
    setBusy(true)
    try {
      const saved = await catalogRepo.upsertProduct(finalDraft, by)
      toast.success(isEditing ? 'Producto actualizado' : 'Producto creado')
      onSaved(saved)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={isEditing ? `Editar "${initial?.name}"` : 'Nuevo producto'}
      size="lg"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Nombre" id="prod-name">
            <input
              id="prod-name"
              value={draft.name}
              onChange={(e) => patch({ name: e.target.value })}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
            />
          </Field>
          <Field label="Categoría" id="prod-cat">
            <select
              id="prod-cat"
              value={draft.categoryId}
              onChange={(e) => patch({ categoryId: e.target.value })}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <PriceInput
            id="prod-price"
            label={draft.is_variable_weight ? 'Precio por kg' : 'Precio'}
            value={draft.price}
            onChange={(v) => patch({ price: v })}
          />
          <Field label="Unidad de venta" id="prod-unit" hint="Ej: '1 L', '500 g', '$/kg' para peso variable">
            <input
              id="prod-unit"
              value={draft.unit}
              onChange={(e) => patch({ unit: e.target.value })}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
            />
          </Field>
        </div>

        <Field label="URL de imagen" id="prod-img" hint="Se auto-genera si se deja vacío">
          <input
            id="prod-img"
            value={draft.imageUrl}
            onChange={(e) => patch({ imageUrl: e.target.value })}
            placeholder="https://…"
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
          />
        </Field>

        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={draft.inStock}
              onChange={(e) => patch({ inStock: e.target.checked })}
            />
            En stock
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={draft.is_variable_weight}
              onChange={(e) => patch({ is_variable_weight: e.target.checked })}
            />
            Peso variable (precio por kg)
          </label>
        </div>

        {!isEditing && (
          <Field label="ID" id="prod-id" hint="Se deriva del nombre si se deja vacío">
            <input
              id="prod-id"
              value={draft.id}
              onChange={(e) => patch({ id: e.target.value })}
              placeholder="ej. leche-entera-1l"
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 font-mono"
            />
          </Field>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100 -mx-6 px-6 -mb-5 pb-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={busy}
            className="px-4 py-2 text-sm text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg"
          >
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function Field({
  label,
  id,
  hint,
  children,
}: {
  label: string
  id: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  )
}
