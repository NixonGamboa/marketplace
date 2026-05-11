// MAUI — Catalog Screen (Pasillo view)
// Grid de productos con badge peso variable y barra flotante.

function CatalogScreen({ pasillo, cart, setCart, onBack, onOpenCart }) {
  const products = MAUI_FRUTAS; // demo: siempre muestra Frutas y Verduras

  const setQty = (p, qty) => {
    setCart(c => {
      const next = { ...c };
      if (qty <= 0) delete next[p.id];
      else next[p.id] = { qty, price: p.price, name: p.name, unit: p.unit, variable: p.variable, img: p.img };
      return next;
    });
  };

  const cartTotal = Object.values(cart).reduce((s, { qty, price }) => s + qty * price, 0);
  const cartCount = Object.values(cart).reduce((s, { qty }) => s + qty, 0);

  return (
    <div style={{ width: '100%', height: '100%', background: 'var(--maui-bg)', overflowY: 'auto', paddingBottom: cartCount ? 160 : 90 }}>
      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 3,
        background: 'var(--maui-bg)', padding: '16px 16px 12px',
        display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid var(--maui-border)',
      }}>
        <button onClick={onBack} style={{ width: 40, height: 40, borderRadius: 20, border: 'none',
                                          background: 'var(--maui-surface)', cursor: 'pointer',
                                          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <IconChevL size={22}/>
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: 'var(--maui-fg-muted)', fontWeight: 600, letterSpacing: '0.03em', textTransform: 'uppercase' }}>Pasillo</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--maui-fg)' }}>{pasillo.name}</div>
        </div>
        <button style={{ width: 40, height: 40, borderRadius: 20, border: 'none',
                         background: 'var(--maui-surface)', cursor: 'pointer',
                         display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <IconSearch size={20}/>
        </button>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 8, padding: '12px 16px', overflowX: 'auto' }}>
        {['Todos', 'Frutas', 'Verduras', 'Hierbas', 'Orgánicos'].map((f, i) => (
          <span key={f} style={{
            flex: '0 0 auto', height: 32, padding: '0 14px',
            background: i === 0 ? 'var(--maui-fg)' : 'var(--maui-surface)',
            color: i === 0 ? '#fff' : 'var(--maui-fg)',
            border: i === 0 ? 'none' : '1px solid var(--maui-border)',
            borderRadius: 'var(--maui-radius-pill)',
            display: 'inline-flex', alignItems: 'center',
            fontSize: 13, fontWeight: 500,
          }}>{f}</span>
        ))}
      </div>

      {/* Grid productos */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: '4px 16px' }}>
        {products.map(p => {
          const qty = cart[p.id]?.qty || 0;
          const outOfStock = p.stock === 0;
          return (
            <div key={p.id} style={{
              background: 'var(--maui-surface)', border: '1px solid var(--maui-border)',
              borderRadius: 'var(--maui-radius-lg)', padding: 10, display: 'flex', flexDirection: 'column',
              position: 'relative',
              opacity: outOfStock ? 0.6 : 1,
            }}>
              {/* Badge peso variable */}
              {p.variable && (
                <span style={{
                  position: 'absolute', top: 12, left: 12, zIndex: 1,
                  background: 'var(--maui-warning-bg)', color: 'var(--maui-warning)',
                  fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 'var(--maui-radius-pill)',
                  textTransform: 'uppercase', letterSpacing: '.02em',
                }}>Peso var.</span>
              )}
              {outOfStock && (
                <span style={{
                  position: 'absolute', top: 12, right: 12, zIndex: 1,
                  background: 'var(--maui-error-bg)', color: 'var(--maui-error)',
                  fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 'var(--maui-radius-pill)',
                }}>Agotado</span>
              )}

              <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0' }}>
                <MauiProductImg name={p.name} size={92} seed={p.img}/>
              </div>

              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--maui-fg)', lineHeight: 1.3,
                            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                            overflow: 'hidden', minHeight: 34 }}>
                {p.name}
              </div>
              <div style={{ fontSize: 11, color: 'var(--maui-fg-muted)', marginTop: 2 }}>
                {p.unit}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--maui-fg)', fontVariantNumeric: 'tabular-nums' }}>
                  {mauiMoney(p.price)}
                </span>
                {outOfStock ? (
                  <button disabled style={{ fontSize: 12, color: 'var(--maui-fg-subtle)',
                                            background: 'var(--maui-gray-100)', border: 'none',
                                            height: 32, padding: '0 10px', borderRadius: 8 }}>
                    Agotado
                  </button>
                ) : qty === 0 ? (
                  <button onClick={() => setQty(p, 1)} style={{
                    width: 32, height: 32, borderRadius: 16, background: 'var(--maui-primary)',
                    color: '#fff', border: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <IconPlus size={18}/>
                  </button>
                ) : (
                  <MauiStepper value={qty} compact onChange={(v) => setQty(p, v)}/>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <MauiFloatingCart itemCount={cartCount} total={cartTotal} onClick={onOpenCart}/>
    </div>
  );
}

window.CatalogScreen = CatalogScreen;
