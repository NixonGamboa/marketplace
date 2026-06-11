import { SUPPORT_EMAIL, SUPPORT_PHONE, SUPPORT_PHONE_RAW, WHATSAPP_LINK } from '@/config/app'
import logoMaui from '@/assets/logo/imagotipo.png'

interface FooterProps {
  supportEmail?: string
  supportPhone?: string
  supportPhoneRaw?: string
  whatsappLink?: string
  year?: number
}

const Footer = ({
  supportEmail = SUPPORT_EMAIL,
  supportPhone = SUPPORT_PHONE,
  supportPhoneRaw = SUPPORT_PHONE_RAW,
  whatsappLink = WHATSAPP_LINK,
  year = new Date().getFullYear(),
}: FooterProps) => {
  return (
    <footer className="mt-auto bg-gray-950 border-t border-white/[0.06] text-white" aria-label="Información del sitio">
      <div className="max-w-screen-xl mx-auto px-6 py-5 md:py-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">

        {/* Marca */}
        <div className="flex items-center gap-3">
          <div className="bg-white rounded-xl p-1 shrink-0 inline-flex items-center justify-center w-14 h-14">
            <img
              src={logoMaui}
              alt="Logo MAUI"
              className="w-full h-full object-contain select-none"
              draggable={false}
            />
          </div>
          <p className="text-xs text-white max-w-sm leading-relaxed">
            Plataforma de e-commerce local que conecta comercios locales con su comunidad.
          </p>
        </div>

        {/* Contacto */}
        <div className="flex flex-col items-center md:items-end gap-2.5">
          <div className="flex flex-col items-center md:items-end gap-1 text-xs text-white">
            <a href={`mailto:${supportEmail}`} className="text-white no-underline">
              {supportEmail}
            </a>
            <a href={`tel:${supportPhoneRaw}`} className="text-white no-underline">
              {supportPhone}
            </a>
          </div>
          <a
            href={whatsappLink}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Contactar soporte por WhatsApp"
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-brand-whatsapp border border-green-600 text-gray-900 no-underline"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 shrink-0" aria-hidden="true">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
            Soporte WhatsApp
          </a>
        </div>
      </div>

      {/* Copyright */}
      <div className="border-t border-white/[0.05] py-3 px-6 flex flex-col md:flex-row items-center justify-center gap-1 md:gap-3 text-xs text-white">
        <span>© {year} <span className="text-white font-medium">MAUI</span></span>
        <span>Desarrollado por GamboaTech</span>
      </div>
    </footer>
  )
}

export type { FooterProps }
export default Footer
