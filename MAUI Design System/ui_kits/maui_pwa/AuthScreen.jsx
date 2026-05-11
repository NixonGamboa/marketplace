// MAUI — Auth Screen (Magic Link por WhatsApp)
// Mobile-first, 100% del viewport.

function AuthScreen({ onLogin }) {
  const [phone, setPhone] = React.useState('');
  const [sent, setSent] = React.useState(false);

  const valid = phone.replace(/\D/g, '').length >= 10;

  return (
    <div style={{
      width: '100%', height: '100%',
      background: 'linear-gradient(180deg, #FDE8C6 0%, #F8F4EE 60%)',
      display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden',
    }}>
      {/* sol ornamental arriba */}
      <div style={{
        position: 'absolute', top: -120, right: -100, width: 320, height: 320,
        background: 'radial-gradient(circle, #FFD54A 0%, #FFB020 55%, transparent 75%)',
        opacity: 0.45, filter: 'blur(2px)',
      }}/>

      <div style={{ flex: 1, padding: '60px 28px 24px', display: 'flex', flexDirection: 'column', zIndex: 1 }}>
        {/* Logo + slogan */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', marginBottom: 40 }}>
          <img src="../../assets/maui-logo.svg" alt="MAUI" style={{ height: 110 }}/>
          <span style={{ marginTop: 14, color: 'var(--maui-fg)', fontSize: 17, fontWeight: 500, lineHeight: 1.35, maxWidth: 280 }}>
            Donde lo necesites, cuando lo necesites.
          </span>
        </div>

        {!sent ? (
          <>
            <h1 className="maui-h2" style={{ marginBottom: 8 }}>Entra con tu WhatsApp</h1>
            <p className="maui-body" style={{ color: 'var(--maui-fg-muted)', marginBottom: 32 }}>
              Te enviamos un enlace seguro. Sin contraseñas ni recordar nada.
            </p>

            <MauiInput
              label="Tu número de WhatsApp"
              placeholder="300 123 4567"
              prefix="🇨🇴 +57"
              inputMode="numeric"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              hint="Te escribimos ahí mismo cuando tu pedido esté listo."
            />

            <div style={{ marginTop: 'auto', paddingTop: 32 }}>
              <MauiButton variant="whatsapp" full disabled={!valid}
                          icon={<IconWhatsApp size={22}/>}
                          onClick={() => setSent(true)}>
                Enviarme enlace por WhatsApp
              </MauiButton>
              <p className="maui-caption" style={{ textAlign: 'center', marginTop: 16, color: 'var(--maui-fg-subtle)' }}>
                Al continuar aceptas los Términos y la Política de Datos de MAUI.
              </p>
            </div>
          </>
        ) : (
          <>
            <h1 className="maui-h2" style={{ marginBottom: 8 }}>Revisa tu WhatsApp</h1>
            <p className="maui-body" style={{ color: 'var(--maui-fg-muted)', marginBottom: 32 }}>
              Te enviamos un enlace a <b>+57 {phone}</b>. Tócalo para entrar.
            </p>

            <div style={{
              background: 'var(--maui-surface)', border: '1px solid var(--maui-border)',
              borderRadius: 'var(--maui-radius-xl)', padding: 20, display: 'flex', gap: 14, alignItems: 'center',
            }}>
              <div style={{ width: 44, height: 44, borderRadius: 22, background: 'var(--maui-whatsapp)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <IconWhatsApp size={22}/>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--maui-fg)' }}>MAUI · Leche y Miel</div>
                <div style={{ fontSize: 13, color: 'var(--maui-fg-muted)', marginTop: 2 }}>
                  Tu enlace para entrar: maui.co/e/9K2a…
                </div>
              </div>
            </div>

            <div style={{ marginTop: 'auto', paddingTop: 32 }}>
              <MauiButton variant="primary" full onClick={onLogin}>
                Abrí el enlace — continuar
              </MauiButton>
              <button onClick={() => setSent(false)}
                      style={{ marginTop: 12, width: '100%', background: 'none', border: 'none',
                               color: 'var(--maui-fg-muted)', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
                Cambiar número
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

window.AuthScreen = AuthScreen;
