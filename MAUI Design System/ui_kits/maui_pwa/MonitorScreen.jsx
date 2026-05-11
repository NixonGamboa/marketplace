// MAUI — Order Monitor Screen
// Stepper de estados + foto de calidad + ajustes por peso real

function MonitorScreen({ onBack }) {
  const order = MAUI_CURRENT_ORDER;
  const states = [
    { id: 0, label: 'Recibido',     t: '3:42 p.m.' },
    { id: 1, label: 'Preparando',   t: '3:45 p.m.' },
    { id: 2, label: 'Listo',        t: '4:08 p.m.' },
    { id: 3, label: 'En camino',    t: null },
    { id: 4, label: 'Entregado',    t: null },
  ];

  const estimated = order.items.reduce((s, it) => s + it.est * it.qty, 0);
  const real = order.items.reduce((s, it) => s + it.real * it.qty, 0);
  const diff = real - estimated;

  return (
    <div style={{ width: '100%', height: '100%', background: 'var(--maui-bg)', overflowY: 'auto', paddingBottom: 40 }}>
      {/* Header */}
      <div style={{ padding: '16px 16px 12px', display: 'flex', alignItems: 'center', gap: 12,
                    background: 'var(--maui-surface)', borderBottom: '1px solid var(--maui-border)' }}>
        <button onClick={onBack} style={{ width: 40, height: 40, borderRadius: 20, border: 'none',
                                          background: 'var(--maui-bg)', cursor: 'pointer',
                                          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <IconChevL size={22}/>
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: 'var(--maui-fg-muted)', fontWeight: 600, letterSpacing: '.03em', textTransform: 'uppercase' }}>
            Pedido · {order.ref}
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--maui-fg)' }}>Monitor del pedido</div>
        </div>
      </div>

      {/* ETA card */}
      <div style={{ margin: 16, background: 'var(--maui-primary)', color: '#fff',
                    borderRadius: 'var(--maui-radius-xl)', padding: 20,
                    boxShadow: 'var(--maui-shadow-md)',
                    display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 56, height: 56, borderRadius: 28, background: 'rgba(255,255,255,0.18)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <IconPkg size={28} stroke="#fff"/>
        </div>
        <div>
          <div style={{ fontSize: 13, opacity: 0.85, fontWeight: 500 }}>Tu mercado está</div>
          <div style={{ fontSize: 22, fontWeight: 800, marginTop: 2 }}>Listo para salir</div>
          <div style={{ fontSize: 13, opacity: 0.85, marginTop: 2 }}>Llega en {order.eta}</div>
        </div>
      </div>

      {/* Stepper */}
      <div style={{ margin: '0 16px', background: 'var(--maui-surface)',
                    border: '1px solid var(--maui-border)', borderRadius: 'var(--maui-radius-xl)',
                    padding: 16 }}>
        {states.map((s, idx) => {
          const done = s.id <= order.state;
          const current = s.id === order.state;
          const last = idx === states.length - 1;
          return (
            <div key={s.id} style={{ display: 'flex', gap: 12, position: 'relative',
                                     paddingBottom: last ? 0 : 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 24 }}>
                <div style={{
                  width: 24, height: 24, borderRadius: 12,
                  background: done ? 'var(--maui-primary)' : 'var(--maui-gray-100)',
                  border: done ? 'none' : '2px solid var(--maui-border)',
                  color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: current ? '0 0 0 5px rgba(47,125,50,0.16)' : 'none',
                }}>
                  {done && <IconCheck size={14} stroke="#fff"/>}
                </div>
                {!last && (
                  <div style={{ flex: 1, minHeight: 24, width: 2,
                                background: done ? 'var(--maui-primary)' : 'var(--maui-border)' }}/>
                )}
              </div>
              <div style={{ flex: 1, paddingBottom: 8 }}>
                <div style={{ fontSize: 14, fontWeight: current ? 700 : 500,
                              color: done ? 'var(--maui-fg)' : 'var(--maui-fg-subtle)' }}>
                  {s.label}
                </div>
                {s.t && <div style={{ fontSize: 12, color: 'var(--maui-fg-muted)', marginTop: 2 }}>{s.t}</div>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Foto de calidad */}
      <div style={{ margin: '16px 16px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <IconCam size={18} stroke="var(--maui-primary)"/>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--maui-fg)', margin: 0 }}>
            Foto de calidad · tu pedido empacado
          </h3>
        </div>
        <div style={{
          width: '100%', aspectRatio: '4 / 3', borderRadius: 'var(--maui-radius-xl)',
          background: 'linear-gradient(135deg, #F0EDE8 0%, #E0DAD2 100%)',
          border: '1px solid var(--maui-border)', overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative',
        }}>
          {/* fake packed bag illustration */}
          <div style={{ fontSize: 92, opacity: 0.85 }}>🛍️</div>
          <div style={{ position: 'absolute', bottom: 12, left: 12, right: 12,
                        background: 'rgba(26,26,26,0.75)', color: '#fff',
                        padding: '8px 12px', borderRadius: 8, fontSize: 12, backdropFilter: 'blur(8px)' }}>
            Empacado por Luisa · {new Date().toLocaleDateString('es-CO')} · 4:06 p.m.
          </div>
        </div>
      </div>

      {/* Ajustes peso real */}
      <div style={{ margin: '16px 16px 0' }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--maui-fg)', margin: '0 0 10px' }}>
          Ajustes tras pesar
        </h3>
        <div style={{ background: 'var(--maui-surface)', border: '1px solid var(--maui-border)',
                      borderRadius: 'var(--maui-radius-xl)', overflow: 'hidden' }}>
          {order.items.map((it, idx) => {
            const d = (it.real - it.est) * it.qty;
            const changed = it.variable && d !== 0;
            return (
              <div key={idx} style={{ padding: 12, display: 'flex', gap: 10, alignItems: 'center',
                                      borderBottom: idx < order.items.length - 1 ? '1px solid var(--maui-border)' : 'none' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--maui-fg)' }}>
                    {it.name} <span style={{ fontWeight: 400, color: 'var(--maui-fg-muted)' }}>× {it.qty}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--maui-fg-muted)', marginTop: 2 }}>
                    Est. {mauiMoney(it.est)} → Real {mauiMoney(it.real)} {changed && (d > 0 ? '(+$' + d.toLocaleString('es-CO') + ')' : '(-$' + (-d).toLocaleString('es-CO') + ')')}
                  </div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: changed
                              ? (d > 0 ? 'var(--maui-warning)' : 'var(--maui-primary)')
                              : 'var(--maui-fg)',
                              fontVariantNumeric: 'tabular-nums' }}>
                  {mauiMoney(it.real * it.qty)}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between',
                      padding: '14px 4px 0', fontSize: 15 }}>
          <span style={{ color: 'var(--maui-fg-muted)' }}>Total final</span>
          <span style={{ fontWeight: 800, color: 'var(--maui-fg)', fontVariantNumeric: 'tabular-nums', fontSize: 18 }}>
            {mauiMoney(real + 3500)}
          </span>
        </div>
        {diff !== 0 && (
          <div style={{ fontSize: 12, color: diff > 0 ? 'var(--maui-warning)' : 'var(--maui-primary)',
                        textAlign: 'right', marginTop: 2, fontWeight: 500 }}>
            {diff > 0 ? `+${mauiMoney(diff)} por peso real` : `${mauiMoney(diff)} ahorrados por peso real`}
          </div>
        )}
      </div>

      {/* WhatsApp shortcut */}
      <div style={{ margin: '16px' }}>
        <MauiButton variant="whatsapp" full icon={<IconWhatsApp size={20}/>}>
          Escribir al supermercado
        </MauiButton>
      </div>
    </div>
  );
}

window.MonitorScreen = MonitorScreen;
