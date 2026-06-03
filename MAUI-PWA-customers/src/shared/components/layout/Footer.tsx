import Icon from '../../components/ui/Icon'
import { SUPPORT_EMAIL, SUPPORT_PHONE, SUPPORT_PHONE_RAW, WHATSAPP_LINK } from '@/config/app'
import logoMaui from '@/assets/logo/logo-maui.svg'

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
    <footer className="mt-auto bg-gray-900 text-white" aria-label="Información del sitio">
      <div className="max-w-screen-xl mx-auto px-6 py-10 md:py-12 flex flex-col gap-10 md:flex-row md:items-start md:justify-between">

        {/* Marca */}
        <div className="flex flex-col items-center md:items-start gap-3 text-center md:text-left">
          <img
            src={logoMaui}
            alt="Logo MAUI"
            className="h-9 w-auto select-none brightness-0 invert"
            draggable={false}
          />
          <p className="text-sm text-gray-400 max-w-xs leading-relaxed">
            Plataforma de e-commerce local que conecta supermercados con su comunidad.
          </p>
        </div>

        {/* Contacto */}
        <div className="flex flex-col items-center md:items-start gap-4 text-sm text-center md:text-left">
          <h3 className="font-semibold text-white tracking-wide uppercase text-xs">Contacto</h3>
          <ul className="space-y-2 text-gray-400">
            <li>
              <a
                href={`mailto:${supportEmail}`}
                className="hover:text-white transition-colors"
              >
                {supportEmail}
              </a>
            </li>
            <li>
              <a
                href={`tel:${supportPhoneRaw}`}
                className="hover:text-white transition-colors"
              >
                {supportPhone}
              </a>
            </li>
          </ul>
          <a
            href={whatsappLink}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Contactar soporte por WhatsApp"
            className="inline-flex items-center gap-2 font-medium text-sm px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 transition-colors"
          >
            <Icon name="whatsapp" className="text-brand-whatsapp" decorative />
            Soporte WhatsApp
          </a>
        </div>
      </div>

      {/* Copyright */}
      <div className="border-t border-white/10 py-4 text-center text-xs text-gray-500">
        © {year} <span className="font-medium text-gray-400">MAUI</span> · Desarrollado por GamboaTech
      </div>
    </footer>
  )
}

export type { FooterProps }
export default Footer
