// MAUI — Home Screen
// Banner saludo + reordenar + Lo que no puede faltar + Pasillos grid

function HomeScreen({ onOpenPasillo, onOpenReorder, cart }) {
  const cartTotal = Object.values(cart).reduce((s, { qty, price }) => s + qty * price, 0);
  const cartCount = Object.values(cart).reduce((s, { qty }) => s + qty, 0);

  return (
    <div style={{ width: '100%', height: '100%', background: 'var(--maui-bg)', overflowY: 'auto', paddingBottom: 90 }}>
      <MauiStoreBanner open cutoff="6:00 p.m."/>

      {/* Header */}
      <div style={{ padding: '20px 20px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 13, color: 'var(--maui-fg-muted)', fontWeight: 500 }}>Hola, Claudia</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--maui-fg)', marginTop: 2 }}>
            ¿Qué llevamos hoy?
          </div>
        </div>
        <div style={{ width: 44, height: 44, borderRadius: 22, background: 'var(--maui-surface)',
                      border: '1px solid var(--maui-border)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <IconUser size={22}/>
        </div>
      </div>

      {/* Search */}
      <div style={{ padding: '0 20px' }}>
        <div style={{
          height: 48, background: 'var(--maui-surface)', border: '1px solid var(--maui-border)',
          borderRadius: 'var(--maui-radius-lg)', display: 'flex', alignItems: 'center', gap: 12,
          padding: '0 16px', color: 'var(--maui-fg-subtle)',
        }}>
          <IconSearch size={20}/>
          <span style={{ fontSize: 15 }}>Buscar arroz, leche, aguacate…</span>
        </div>
      </div>

      {/* Reordenar */}
      <div style={{ padding: '20px' }}>
        <button onClick={onOpenReorder} style={{
          width: '100%', background: 'var(--maui-surface)', border: '1px solid var(--maui-border)',
          borderRadius: 'var(--maui-radius-xl)', padding: 16, display: 'flex', alignItems: 'center', gap: 14,
          cursor: 'pointer', textAlign: 'left',
        }}>
          <div style={{ width: 48, height: 48, borderRadius: 24, background: 'var(--maui-primary-50)',
                        color: 'var(--maui-primary)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <IconRepeat size={24}/>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--maui-fg)' }}>Repetir mercado del {MAUI_LAST_ORDER.date}</div>
            <div style={{ fontSize: 13, color: 'var(--maui-fg-muted)', marginTop: 2 }}>
              {MAUI_LAST_ORDER.items} productos · {mauiMoney(MAUI_LAST_ORDER.total)}
            </div>
          </div>
          <IconChevR size={20}/>
        </button>
      </div>

      {/* Lo que no puede faltar */}
      <div style={{ padding: '0 0 0 20px' }}>
        <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--maui-fg)', margin: '0 0 12px' }}>
          Lo que no puede faltar
        </h3>
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingRight: 20, paddingBottom: 8 }}>
          {MAUI_FAV.map(p => (
            <div key={p.id} style={{
              flex: '0 0 auto', width: 148,
              background: 'var(--maui-surface)', border: '1px solid var(--maui-border)',
              borderRadius: 'var(--maui-radius-lg)', padding: 10,
            }}>
              <MauiProductImg name={p.name} size={128} seed={p.img}/>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--maui-fg)', marginTop: 8, lineHeight: 1.3,
                            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: 34 }}>
                {p.name}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--maui-fg)', fontVariantNumeric: 'tabular-nums' }}>
                  {mauiMoney(p.price)}
                </span>
                <div style={{ width: 28, height: 28, borderRadius: 14, background: 'var(--maui-primary)',
                              color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <IconPlus size={16}/>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Pasillos */}
      <div style={{ padding: '24px 20px 0' }}>
        <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--maui-fg)', margin: '0 0 12px' }}>
          Pasillos
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {MAUI_PASILLOS.map(p => (
            <button key={p.id} onClick={() => onOpenPasillo(p)} style={{
              background: p.bg, border: 'none', borderRadius: 'var(--maui-radius-xl)',
              padding: '16px 14px', textAlign: 'left', cursor: 'pointer',
              minHeight: 110, display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
            }}>
              <div style={{ fontSize: 36 }}>{p.icon}</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--maui-fg)', lineHeight: 1.2 }}>{p.name}</div>
                <div style={{ fontSize: 12, color: 'var(--maui-fg-muted)', marginTop: 2 }}>{p.count} productos</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <MauiFloatingCart itemCount={cartCount} total={cartTotal} onClick={() => onOpenPasillo({ id: 'cart' })}/>
    </div>
  );
}

window.HomeScreen = HomeScreen;
