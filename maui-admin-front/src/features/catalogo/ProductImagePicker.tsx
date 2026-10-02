import { useEffect, useState } from 'react'
import { PRODUCT_IMAGE_ACCEPT, PRODUCT_IMAGE_LIMITS } from '../../../../shared/contracts/media'

interface ProductImagePickerProps {
  file: File | null
  disabled: boolean
  hint?: string
  onChange(file: File | null): void
}

/** Elegir no sube ni guarda: la imagen se envía únicamente al pulsar Guardar. */
export function ProductImagePicker({ file, disabled, hint, onChange }: ProductImagePickerProps) {
  const [error, setError] = useState('')
  const [preview, setPreview] = useState('')
  useEffect(() => {
    if (!file) { setPreview(''); return }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  function select(file: File | undefined) {
    setError('')
    if (!file) return
    if (!PRODUCT_IMAGE_ACCEPT.split(',').includes(file.type) || file.size === 0 || file.size > PRODUCT_IMAGE_LIMITS.inputBytes) {
      setError('Elige JPEG, PNG o WebP de hasta 3 MiB.'); return
    }
    onChange(file)
  }

  return <fieldset disabled={disabled} className="space-y-2">
    <legend className="text-sm font-medium text-gray-700">Foto del producto</legend>
    <label className="block text-sm" htmlFor="product-image-file">Elegir archivo</label>
    <input id="product-image-file" type="file" accept={PRODUCT_IMAGE_ACCEPT}
      onChange={(event) => { select(event.target.files?.[0]); event.target.value = '' }} />
    <label className="block text-sm" htmlFor="product-image-camera">Tomar foto</label>
    <input id="product-image-camera" type="file" accept={PRODUCT_IMAGE_ACCEPT} capture="environment"
      onChange={(event) => { select(event.target.files?.[0]); event.target.value = '' }} />
    {hint && <p className="text-xs text-gray-500">{hint}</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {file && <div>
      {preview && <img src={preview} alt="Vista previa de la foto elegida" className="w-24 h-24 object-contain" />}
      <p className="text-xs">{file.name} · Pendiente de guardar</p>
      <button type="button" onClick={() => { setError(''); onChange(null) }} className="text-sm text-indigo-700">Quitar foto elegida</button>
    </div>}
  </fieldset>
}
