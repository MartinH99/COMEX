import React from 'react';

export function Header({ currentTab, setTab }) {
  const tabs = [
    { id: 'home', label: '🏠 Inicio' },
    { id: 'dashboard', label: '📊 Dashboard' },
    { id: 'shipments', label: '📦 Embarques' },
    { id: 'new-shipment', label: '➕ Nuevo Embarque' },
    { id: 'clients', label: '👥 Clientes CRM' },
    { id: 'calibers', label: '🏷️ Matriz Calibres' }
  ];

  return (
    <header className="main-header">
      <div className="header-container">
      <div
  className="brand"
  onClick={() => setTab(tabs[0].id)}
  style={{ cursor: 'pointer' }}
>
  🥝 Comex
</div>
        <nav>
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={currentTab === tab.id ? 'active' : ''}
              onClick={() => setTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
}