const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: ['M12 20V10', 'M18 20V4', 'M6 20v-4'] },
  { id: 'prospects', label: 'Prospectos', icon: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z', 'M14 2v6h6', 'M9 13h6', 'M9 17h6'] },
  { id: 'shipments', label: 'Embarques', icon: ['M2 20h20', 'M4 20l-1-6h18l-2 6', 'M6 14V8h12v6', 'M12 8V3'] },
  { id: 'clients', label: 'Clientes', icon: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M22 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'] },
  { id: 'calibers', label: 'Calibres', icon: ['M3 3h7v7H3z', 'M14 3h7v7h-7z', 'M14 14h7v7h-7z', 'M3 14h7v7H3z'] }
];

const HOME_ITEM = { id: 'home', label: 'Sitio institucional', icon: ['M3 10.5 12 3l9 7.5', 'M5 9v12h14V9', 'M10 21v-6h4v6'] };

function NavItem({ item, active, onClick }) {
  return (
    <button
      className={`nav-item${active ? ' active' : ''}`}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {item.icon.map(d => <path key={d} d={d} />)}
      </svg>
      {item.label}
    </button>
  );
}

export function Sidebar({ currentTab, setTab, unread, onOpenNotifications }) {
  // Los formularios de alta son parte de su sección
  const parentTab = { 'new-shipment': 'shipments', 'prospect-form': 'prospects' };
  const activeTab = parentTab[currentTab] || currentTab;

  return (
    <aside className="sidebar">
      <div className="sb-brand">
        <button className="sb-home" aria-label="COMEX, ir al inicio" title="Ir al inicio" onClick={() => setTab(HOME_ITEM.id)}>
          <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
            <circle cx="16" cy="16" r="15" fill="#7A5A32" />
            <circle cx="16" cy="16" r="12.5" fill="#B7D84B" />
            <circle cx="16" cy="16" r="4" fill="#F4F7EC" />
          </svg>
          <span className="sb-name">COMEX</span>
        </button>
        <button
          className="bell"
          aria-label={unread > 0 ? `Notificaciones, ${unread} sin leer` : 'Notificaciones'}
          title="Notificaciones"
          onClick={onOpenNotifications}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.7 21a2 2 0 0 1-3.4 0" />
          </svg>
          {unread > 0 && <span className="bell-count">{unread > 99 ? '99+' : unread}</span>}
        </button>
      </div>
      <div className="sb-sub">Gestión de exportaciones</div>

      <nav className="sb-nav">
        {NAV_ITEMS.map(item => (
          <NavItem key={item.id} item={item} active={activeTab === item.id} onClick={() => setTab(item.id)} />
        ))}
        <div className="sb-spacer" />
        <div className="sb-sep" />
        <NavItem item={HOME_ITEM} active={activeTab === HOME_ITEM.id} onClick={() => setTab(HOME_ITEM.id)} />
      </nav>
    </aside>
  );
}
