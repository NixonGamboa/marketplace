// MAUI — Checkout Screen (V1: canasta + confirmación)
// V1 NO incluye módulo de sustitución (se agrega en V2).

function CheckoutScreen({ cart, setCart, onBack, onConfirm }) {
  const items = Object.entries(cart);
  const subtotal = items.reduce((s, [, it]) => s + it.qty * it.price, 0);
  const delivery = 3500;
  const total = subtotal + delivery;

  if (items.length === 0) {
    return (
      <div style={{ width: '100%', height: '100%', background: 'var(--maui-bg)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    justifyContent: 'center', padding: 40, textAlign: 'center' }}>
        <div style={{ width: 72, height: 72, borderRadius: 36, background: 'var(--maui-primary-50)',
                      color: 'var(--maui-primary)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
          <IconCart size={36}/>
        </div>
        <h3 style={{ fontSize: 20, fontWeight: 700, color: 'var(--maui-fg)' }}>Tu canasta está vacía</h3>
        <p style={{ color: 'var(--maui-fg-muted)', marginTop: 6, fontSize: 14 }}>
          Agrega productos desde los pasillos para empezar tu mercado.
        </p>
        <div style={{ marginTop: 24, width: '100%', maxWidth: 280 }}>
          <MauiButton variant="primary" full onClick={onBack}>Explorar pasillos</MauiButton>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', background: 'var(--maui-bg)', overflowY: 'auto', paddingBottom: 150 }}>
      {/* Header */}
      <div style={{ padding: '16px 16px 12px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={onBack} style={{ width: 40, height: 40, borderRadius: 20, border: 'none',
                                          background: 'var(--maui-surface)', cursor: 'pointer',
                                          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <IconChevL size={22}/>
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: 'var(--maui-fg-muted)', fontWeight: 600, letterSpacing: '0.03em', textTransform: 'uppercase' }}>Tu canasta</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--maui-fg)' }}>Cerrar pedido</div>
        </div>
      </div>

      {/* Items */}
      <div style={{ margin: '0 16px', background: 'var(--maui-surface)',
                    border: '1px solid var(--maui-border)', borderRadius: 'var(--maui-radius-xl)',
                    overflow: 'hidden' }}>
        {items.map(([id, it], idx) => (
          <div key={id} style={{
            padding: 12, display: 'flex', gap: 12, alignItems: 'center',
            borderBottom: idx < items.length - 1 ? '1px solid var(--maui-border)' : 'none',
          }}>
            <MauiProductImg name={it.name} size={56} seed={it.img}/>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--maui-fg)',
                            display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {it.name}
                {it.variable && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--maui-warning)',
                                 background: 'var(--maui-warning-bg)', padding: '2px 6px',
                                 borderRadius: 6, textTransform: 'uppercase' }}>Peso var.</span>
                )}
              </div>
              <div style={{ fontSize: 12, color: 'var(--maui-fg-muted)', marginTop: 2 }}>
                {it.qty} × {it.unit} · {mauiMoney(it.price)}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--maui-fg)', fontVariantNumeric: 'tabular-nums' }}>
                {mauiMoney(it.qty * it.price)}
              </div>
              <button onClick={() => setCart(c => { const n = { ...c }; delete n[id]; return n; })}
                      style={{ fontSize: 12, color: 'var(--maui-fg-subtle)', background: 'none',
                               border: 'none', cursor: 'pointer', marginTop: 2 }}>
                Quitar
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Resumen */}
      <div style={{ margin: '20px 16px 0',
                    background: 'var(--maui-surface)', border: '1px solid var(--maui-border)',
                    borderRadius: 'var(--maui-radius-xl)', padding: 16 }}>
        <Row label="Subtotal" value={mauiMoney(subtotal)}/>
        <Row label="Domicilio" value={mauiMoney(delivery)}/>
        <div style={{ height: 1, background: 'var(--maui-border)', margin: '8px 0' }}/>
        <Row label="Total estimado" value={mauiMoney(total)} big/>
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--maui-fg-muted)',
                      background: 'var(--maui-warning-bg)', padding: 10, borderRadius: 8 }}>
          <b style={{ color: 'var(--maui-warning)' }}>Peso real:</b> El total puede variar unas monedas
          tras pesar las carnes, frutas y verduras en tienda. Te avisamos antes de entregar.
        </div>
      </div>

      {/* Sticky CTA */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0,
                    background: 'var(--maui-surface)', borderTop: '1px solid var(--maui-border)',
                    padding: '14px 16px 26px', boxShadow: 'var(--maui-shadow-float)', zIndex: 10 }}>
        <MauiButton variant="primary" full onClick={onConfirm}>
          Confirmar pedido · {mauiMoney(total)}
        </MauiButton>
        <p style={{ fontSize: 11, color: 'var(--maui-fg-subtle)', textAlign: 'center', margin: '8px 0 0' }}>
          Pago contra entrega · Efectivo o transferencia
        </p>
      </div>
    </div>
  );
}

function Row({ label, value, big }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0',
                  fontSize: big ? 17 : 14,
                  fontWeight: big ? 700 : 500,
                  color: big ? 'var(--maui-fg)' : 'var(--maui-fg-muted)' }}>
      <span>{label}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--maui-fg)' }}>{value}</span>
    </div>
  );
}

window.CheckoutScreen = CheckoutScreen;
