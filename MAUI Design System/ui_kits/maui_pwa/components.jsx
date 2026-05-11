// MAUI Shared Components — buttons, inputs, icons, cards
// Uses CSS vars from colors_and_type.css (loaded via index.html)
// -----------------------------------------------------

// ─── ICONS (Lucide-style, 2px stroke) ───────────────────────────────────
const mauiIcon = (paths, { size = 24, stroke = 'currentColor', fill = 'none' } = {}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={stroke}
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {paths}
  </svg>
);
const IconHome     = (p) => mauiIcon(<><path d="M3 9.5 12 3l9 6.5V21a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1V9.5z"/></>, p);
const IconSearch   = (p) => mauiIcon(<><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></>, p);
const IconCart     = (p) => mauiIcon(<><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M3 4h2l2.5 12h12L22 8H6"/></>, p);
const IconUser     = (p) => mauiIcon(<><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/></>, p);
const IconChevR    = (p) => mauiIcon(<><path d="M9 6l6 6-6 6"/></>, p);
const IconChevL    = (p) => mauiIcon(<><path d="M15 6l-9 6 9 6"/></>, p);
const IconPlus     = (p) => mauiIcon(<><path d="M12 5v14M5 12h14"/></>, p);
const IconMinus    = (p) => mauiIcon(<><path d="M5 12h14"/></>, p);
const IconCheck    = (p) => mauiIcon(<><path d="M20 6 9 17l-5-5"/></>, p);
const IconClock    = (p) => mauiIcon(<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>, p);
const IconPkg      = (p) => mauiIcon(<><path d="M21 8 12 3 3 8v8l9 5 9-5V8z"/><path d="M3 8l9 5 9-5M12 13v8"/></>, p);
const IconCam      = (p) => mauiIcon(<><path d="M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="4"/></>, p);
const IconAlert    = (p) => mauiIcon(<><path d="M12 3 1 22h22L12 3z"/><path d="M12 10v5M12 18v.5"/></>, p);
const IconRepeat   = (p) => mauiIcon(<><path d="M17 2l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3"/></>, p);
const IconX        = (p) => mauiIcon(<><path d="M18 6 6 18M6 6l12 12"/></>, p);
const IconPhone    = (p) => mauiIcon(<><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .3 1.9.6 2.8a2 2 0 0 1-.5 2.1L8 10a16 16 0 0 0 6 6l1.4-1.4a2 2 0 0 1 2.1-.5c.9.3 1.8.5 2.8.6a2 2 0 0 1 1.7 2z"/></>, p);
const IconWhatsApp = ({ size = 24, color = '#fff' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true">
    <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm0 18.15c-1.49 0-2.95-.4-4.22-1.16l-.3-.18-3.12.82.83-3.04-.2-.31a8.23 8.23 0 0 1-1.26-4.37c0-4.54 3.7-8.23 8.27-8.23 2.21 0 4.29.86 5.85 2.42a8.18 8.18 0 0 1 2.42 5.83c0 4.54-3.7 8.23-8.27 8.23zm4.52-6.16c-.25-.12-1.47-.73-1.7-.81-.23-.08-.39-.12-.56.12-.17.25-.64.81-.79.98-.14.17-.29.19-.54.06-.25-.12-1.05-.39-2-1.23a7.4 7.4 0 0 1-1.37-1.7c-.14-.25-.02-.38.11-.5.11-.11.25-.29.37-.44.12-.14.16-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.35-.77-1.85-.2-.48-.4-.42-.56-.43h-.48c-.17 0-.43.06-.66.31s-.87.85-.87 2.07.89 2.4 1.02 2.56c.12.17 1.75 2.67 4.23 3.74.59.25 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.08.15-1.18-.06-.11-.23-.17-.48-.29z"/>
  </svg>
);

// ─── BUTTON ─────────────────────────────────────────────────────────────
function MauiButton({ children, variant = 'primary', size = 'lg', icon, full, onClick, disabled, style = {} }) {
  const base = {
    fontFamily: 'var(--maui-font-sans)',
    fontWeight: 'var(--maui-weight-semibold)',
    border: 'none',
    borderRadius: 'var(--maui-radius-lg)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    transition: 'all var(--maui-dur-fast) var(--maui-ease)',
    width: full ? '100%' : 'auto',
    opacity: disabled ? 0.5 : 1,
  };
  const sizes = {
    lg: { height: 52, padding: '0 20px', fontSize: 16 },
    md: { height: 44, padding: '0 16px', fontSize: 15 },
    sm: { height: 36, padding: '0 12px', fontSize: 14 },
  };
  const variants = {
    primary:   { background: 'var(--maui-primary)', color: '#fff', boxShadow: 'var(--maui-shadow-sm)' },
    secondary: { background: 'var(--maui-surface)', color: 'var(--maui-fg)', border: '1.5px solid var(--maui-border-strong)' },
    ghost:     { background: 'transparent', color: 'var(--maui-fg)' },
    whatsapp:  { background: 'var(--maui-whatsapp)', color: '#fff', boxShadow: 'var(--maui-shadow-sm)' },
    danger:    { background: 'var(--maui-error)', color: '#fff' },
  };
  return (
    <button onClick={disabled ? undefined : onClick}
            style={{ ...base, ...sizes[size], ...variants[variant], ...style }}>
      {icon && <span style={{ display: 'inline-flex' }}>{icon}</span>}
      {children}
    </button>
  );
}

// ─── INPUT ──────────────────────────────────────────────────────────────
function MauiInput({ label, hint, error, value, onChange, placeholder, type = 'text', prefix, inputMode }) {
  const [focused, setFocused] = React.useState(false);
  return (
    <label style={{ display: 'block', fontFamily: 'var(--maui-font-sans)' }}>
      {label && <span style={{ display: 'block', fontSize: 14, fontWeight: 500, color: 'var(--maui-fg)', marginBottom: 8 }}>{label}</span>}
      <div style={{
        display: 'flex', alignItems: 'center',
        height: 52,
        background: 'var(--maui-surface)',
        border: `1.5px solid ${error ? 'var(--maui-error)' : focused ? 'var(--maui-primary)' : 'var(--maui-border)'}`,
        borderRadius: 'var(--maui-radius-lg)',
        boxShadow: focused ? '0 0 0 4px rgba(47,125,50,0.12)' : 'none',
        transition: 'all var(--maui-dur-fast) var(--maui-ease)',
        paddingLeft: prefix ? 12 : 16,
      }}>
        {prefix && <span style={{ color: 'var(--maui-fg-muted)', marginRight: 8, fontSize: 16 }}>{prefix}</span>}
        <input type={type} value={value} onChange={onChange} placeholder={placeholder} inputMode={inputMode}
               onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
               style={{ flex: 1, height: '100%', border: 'none', outline: 'none', background: 'transparent',
                        fontSize: 16, fontFamily: 'inherit', color: 'var(--maui-fg)', paddingRight: 16 }}/>
      </div>
      {(hint || error) && <span style={{ display: 'block', fontSize: 13, marginTop: 6, color: error ? 'var(--maui-error)' : 'var(--maui-fg-muted)' }}>{error || hint}</span>}
    </label>
  );
}

// ─── QTY STEPPER ────────────────────────────────────────────────────────
function MauiStepper({ value, onChange, min = 0, compact = false }) {
  const h = compact ? 36 : 44;
  const iconSize = compact ? 16 : 18;
  const btnStyle = (disabled) => ({
    width: h, height: h, borderRadius: 'var(--maui-radius-md)', border: 'none',
    background: 'transparent', color: '#fff',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.4 : 1,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 0,
    transition: 'background var(--maui-dur-fast) var(--maui-ease)',
  });
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center',
                  background: 'var(--maui-primary)', color: '#fff',
                  borderRadius: 'var(--maui-radius-pill)',
                  boxShadow: '0 1px 2px rgba(26,26,26,.08)',
                  overflow: 'hidden' }}>
      <button onClick={() => onChange(Math.max(min, value - 1))}
              style={btnStyle(value <= min)}
              disabled={value <= min}
              aria-label="Disminuir">
        <IconMinus size={iconSize}/>
      </button>
      <span style={{ minWidth: compact ? 24 : 32, textAlign: 'center',
                     fontSize: compact ? 14 : 16, fontWeight: 700,
                     fontVariantNumeric: 'tabular-nums',
                     padding: '0 2px' }}>{value}</span>
      <button onClick={() => onChange(value + 1)}
              style={btnStyle(false)}
              aria-label="Aumentar">
        <IconPlus size={iconSize}/>
      </button>
    </div>
  );
}

// ─── PRODUCT PLACEHOLDER IMAGE ──────────────────────────────────────────
// Usamos círculos de color + inicial como placeholder consistente (sin emoji en UI).
function MauiProductImg({ name, size = 64, seed = 'a' }) {
  const palette = [
    ['#E8F5E9', '#2F7D32'],
    ['#FDF3E0', '#E65100'],
    ['#FCEBE3', '#B71C1C'],
    ['#FDE8C6', '#8B5E00'],
    ['#E3F0FA', '#0F5B8B'],
    ['#F1E5FA', '#6B1F9E'],
  ];
  const code = (seed.charCodeAt(0) + (seed.charCodeAt(1) || 0)) % palette.length;
  const [bg, fg] = palette[code];
  return (
    <div style={{
      width: size, height: size, borderRadius: 'var(--maui-radius-md)',
      background: bg, color: fg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.4, fontWeight: 700, fontFamily: 'var(--maui-font-sans)',
      flexShrink: 0,
    }}>{name.trim().charAt(0).toUpperCase()}</div>
  );
}

// ─── PRICE FORMAT ───────────────────────────────────────────────────────
const mauiMoney = (n) => '$' + n.toLocaleString('es-CO');

// ─── STORE STATUS BANNER ────────────────────────────────────────────────
function MauiStoreBanner({ open = true, cutoff = '6:00 p.m.' }) {
  const bg = open ? 'var(--maui-success-bg)' : 'var(--maui-error-bg)';
  const fg = open ? 'var(--maui-primary-dark)' : 'var(--maui-error)';
  return (
    <div style={{
      height: 40, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 8,
      background: bg, color: fg, fontSize: 13, fontWeight: 500, fontFamily: 'var(--maui-font-sans)',
    }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: fg, boxShadow: open ? `0 0 0 4px ${fg}22` : 'none' }}/>
      {open
        ? <>Leche y Miel está <b style={{ fontWeight: 700 }}>abierto</b> · Cierra a las {cutoff}</>
        : <>Leche y Miel está <b style={{ fontWeight: 700 }}>cerrado</b> · Abre a las 8:00 a.m.</>}
    </div>
  );
}

// ─── BOTTOM TAB BAR ─────────────────────────────────────────────────────
function MauiTabBar({ active = 'home', onNav, cartCount = 0 }) {
  const tabs = [
    { id: 'home', label: 'Inicio',   Icon: IconHome },
    { id: 'pasillos', label: 'Pasillos', Icon: IconSearch },
    { id: 'cart', label: 'Canasta',  Icon: IconCart, badge: cartCount },
    { id: 'me',   label: 'Mi cuenta',Icon: IconUser },
  ];
  return (
    <nav style={{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      height: 72, background: 'var(--maui-surface)',
      borderTop: '1px solid var(--maui-border)',
      display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
      paddingBottom: 12,
    }}>
      {tabs.map(t => {
        const on = t.id === active;
        return (
          <button key={t.id} onClick={() => onNav(t.id)}
            style={{ border: 'none', background: 'none', cursor: 'pointer',
                     display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                     gap: 2, color: on ? 'var(--maui-primary)' : 'var(--maui-fg-subtle)',
                     fontSize: 11, fontFamily: 'var(--maui-font-sans)',
                     fontWeight: on ? 600 : 500, position: 'relative' }}>
            <div style={{ position: 'relative' }}>
              <t.Icon size={24}/>
              {t.badge > 0 && (
                <span style={{ position: 'absolute', top: -4, right: -8, minWidth: 16, height: 16,
                               borderRadius: 8, background: 'var(--maui-primary)', color: '#fff',
                               fontSize: 10, fontWeight: 700, padding: '0 4px',
                               display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{t.badge}</span>
              )}
            </div>
            <span>{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

// ─── FLOATING CART BAR ──────────────────────────────────────────────────
function MauiFloatingCart({ itemCount, total, onClick }) {
  if (!itemCount) return null;
  return (
    <div style={{
      position: 'absolute', left: 16, right: 16, bottom: 88,
      height: 56, background: 'var(--maui-primary)', color: '#fff',
      borderRadius: 'var(--maui-radius-lg)', boxShadow: 'var(--maui-shadow-md)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 18px', cursor: 'pointer', zIndex: 5,
      fontFamily: 'var(--maui-font-sans)',
    }} onClick={onClick}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 28, height: 28, borderRadius: 14, background: 'rgba(255,255,255,0.2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>
          {itemCount}
        </div>
        <span style={{ fontSize: 15, fontWeight: 600 }}>Ver canasta</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
        <span style={{ fontSize: 16 }}>{mauiMoney(total)}</span>
        <IconChevR size={20}/>
      </div>
    </div>
  );
}

Object.assign(window, {
  MauiButton, MauiInput, MauiStepper, MauiProductImg,
  MauiStoreBanner, MauiTabBar, MauiFloatingCart, mauiMoney,
  IconHome, IconSearch, IconCart, IconUser, IconChevR, IconChevL,
  IconPlus, IconMinus, IconCheck, IconClock, IconPkg, IconCam, IconAlert, IconRepeat, IconX, IconPhone, IconWhatsApp,
});
