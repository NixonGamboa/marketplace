import { useQuery } from '@tanstack/react-query'
import { isDemoMode } from '@/config/mode'
import { realCatalogService } from '@/services/realCatalogService'
import { useMerchantWhatsApp } from './useMerchantWhatsApp'

/**
 * Contacto real del negocio: `contactPhone` de GET /api/store (canónico, sin el número de relleno).
 * Vive en la caché de consultas compartida con el checkout; un fallo o `null` oculta el contacto.
 */
function useServerContactPhone(): string | null {
  const { data } = useQuery({
    queryKey: ['store'],
    queryFn: ({ signal }) => realCatalogService.getStore({ signal }),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  })
  return data?.contactPhone ?? null
}

/**
 * WhatsApp del negocio para enlaces `wa.me`. Demo: el valor local que configura el admin demo; real:
 * el servidor, nunca el almacenamiento del navegador. El modo es fijo durante la vida de la app, así
 * que el orden de los hooks no cambia entre renders.
 */
export function useStoreContactPhone(): string | null {
  return (isDemoMode() ? useMerchantWhatsApp : useServerContactPhone)()
}
