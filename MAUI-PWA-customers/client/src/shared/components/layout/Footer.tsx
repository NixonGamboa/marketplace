import Icon from '../../components/ui/Icon'
import { SUPPORT_EMAIL, SUPPORT_PHONE, SUPPORT_PHONE_RAW, WHATSAPP_LINK } from '@/config/app'

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
    <footer className="mt-auto bg-brand-bg/95 backdrop-blur-md border-t border-brand-primary/30 text-white" aria-label="Información del sitio">
      <div className="max-w-screen-xl mx-auto px-4 py-8 md:py-10 flex flex-col gap-8 md:gap-10 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col items-center md:items-start gap-4 text-center md:text-left">
          <div className="flex items-center gap-2 font-semibold text-lg">
            <img
              src="/logo/maui-logo.svg"
              alt="Logo MAUI"
              className="h-9 w-auto select-none"
              draggable={false}
            />
            <span className="sr-only">MAUI - Ecommerce Local</span>
          </div>
          <p className="text-sm max-w-xs text-white/70">
            Plataforma de e-commerce local conectando supermercados de tu comunidad.
          </p>
        </div>

        <div className="grid gap-4 text-sm md:text-left text-center">
          <div>
            <h3 className="font-semibold mb-2 text-white">Contacto</h3>
            <ul className="space-y-1 text-white/80">
              <li>
                <a
                  href={`mailto:${supportEmail}`}
                  className="hover:text-brand-primary underline-offset-2 hover:underline"
                >
                  {supportEmail}
                </a>
              </li>
              <li>
                <a
                  href={`tel:${supportPhoneRaw}`}
                  className="hover:text-brand-primary underline-offset-2 hover:underline"
                >
                  {supportPhone}
                </a>
              </li>
            </ul>
          </div>
          <div>
            <a
              href={whatsappLink}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Contactar soporte por WhatsApp"
              className="inline-flex items-center gap-2 font-medium transition-colors whitespace-nowrap select-none bg-white/10 backdrop-blur-sm text-white border border-white/30 hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:outline-none text-sm px-3 py-1.5 rounded-md"
            >
              <Icon name="whatsapp" className="text-brand-whatsapp" decorative />
              Soporte WhatsApp
            </a>
          </div>
        </div>
      </div>

      <div className="border-t border-brand-primary/30 py-4 text-center text-xs text-white/60">
        <p>
          Todos los derechos reservados © {year} <span className="font-semibold">MAUI</span>. Desarrollado por GamboaTech.
        </p>
      </div>
    </footer>
  )
}

export type { FooterProps }
export default Footer
