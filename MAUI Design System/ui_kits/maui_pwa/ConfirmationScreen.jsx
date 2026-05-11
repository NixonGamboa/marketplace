// MAUI — Order Confirmation Screen

function ConfirmationScreen({ total, ref = 'MAU-2068', onMonitor, onHome }) {
  return (
    <div style={{ width: '100%', height: '100%',
                  background: 'linear-gradient(180deg, #E8F5E9 0%, #F8F4EE 55%)',
                  display: 'flex', flexDirection: 'column', padding: '48px 28px 24px',
                  position: 'relative', overflow: 'hidden' }}>
      {/* Sun glow ornament */}
      <div style={{
        position: 'absolute', top: -140, left: -120, width: 340, height: 340,
        background: 'radial-gradient(circle, #FFD54A 0%, #FFB020 55%, transparent 75%)',
        opacity: 0.35,
      }}/>

      {/* Success mark */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 1, marginTop: 32 }}>
        <div style={{
          width: 96, height: 96, borderRadius: 48,
          background: 'var(--maui-primary)', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 12px 32px rgba(47,125,50,0.32)',
        }}>
          <IconCheck size={52} stroke="#fff"/>
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--maui-fg)', marginTop: 24, textAlign: 'center', letterSpacing: '-0.02em' }}>
          ¡Pedido recibido!
        </h1>
        <p style={{ fontSize: 15, color: 'var(--maui-fg-muted)', marginTop: 6, textAlign: 'center', maxWidth: 280 }}>
          Leche y Miel lo está preparando. Te escribimos por WhatsApp con el total final tras pesar.
        </p>
      </div>

      {/* Reference card */}
      <div style={{ marginTop: 32,
                    background: 'var(--maui-surface)', border: '1px solid var(--maui-border)',
                    borderRadius: 'var(--maui-radius-xl)', padding: 20, zIndex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 12, color: 'var(--maui-fg-muted)', fontWeight: 600, letterSpacing: '.03em', textTransform: 'uppercase' }}>Referencia</span>
          <span style={{ fontFamily: 'var(--maui-font-mono)', fontSize: 14, fontWeight: 600 }}>{ref}</span>
        </div>
        <div style={{ height: 1, background: 'var(--maui-border)', margin: '12px 0' }}/>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 13, color: 'var(--maui-fg-muted)' }}>Total estimado</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--maui-fg)', fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>
              {mauiMoney(total)}
            </div>
            <div style={{ fontSize: 12, color: 'var(--maui-fg-subtle)', marginTop: 2 }}>Pago contra entrega</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 13, color: 'var(--maui-fg-muted)' }}>Entrega en</div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <IconClock size={16} stroke="var(--maui-primary)"/>
              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--maui-primary)' }}>40–55 min</span>
            </div>
          </div>
        </div>
      </div>

      {/* CTAs */}
      <div style={{ marginTop: 'auto', zIndex: 1 }}>
        <MauiButton variant="primary" full onClick={onMonitor}>Ver monitor del pedido</MauiButton>
        <button onClick={onHome} style={{ marginTop: 12, width: '100%', background: 'none', border: 'none',
                                          color: 'var(--maui-fg-muted)', fontSize: 14, fontWeight: 500, cursor: 'pointer', padding: 12 }}>
          Volver al inicio
        </button>
      </div>
    </div>
  );
}

window.ConfirmationScreen = ConfirmationScreen;
