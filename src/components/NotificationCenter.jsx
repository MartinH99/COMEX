import { useState } from 'react';
import { formatDateTime } from './ui';

export const NOTIFICATION_TYPES = {
  'status': { label: 'Cambio de estado', badge: 'brand' },
  'followup': { label: 'Seguimiento', badge: 'gray' },
  'delivery': { label: 'Entrega', badge: 'ok' },
  'created': { label: 'Nuevo embarque', badge: 'brand' },
  'deleted': { label: 'Eliminado', badge: 'alert' },
  'due-soon': { label: 'Entrega próxima', badge: 'pend' },
  'overdue': { label: 'Entrega vencida', badge: 'alert' }
};

export function NotificationCenter({ notifications, unread, onOpen, onReadAll, onClose }) {
  const [onlyUnread, setOnlyUnread] = useState(false);
  const visible = onlyUnread ? notifications.filter(n => !n.isRead) : notifications;

  return (
    <div className="drawer-overlay" onClick={onClose} onKeyDown={e => e.key === 'Escape' && onClose()}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="notifications-title" onClick={e => e.stopPropagation()}>
        <div className="drawer-header">
          <h2 id="notifications-title">Notificaciones</h2>
          <button className="btn btn-subtle btn-small" autoFocus onClick={onClose}>Cerrar</button>
        </div>

        <div className="drawer-tools">
          <div className="pills">
            <button className={!onlyUnread ? 'active' : ''} onClick={() => setOnlyUnread(false)}>Todas</button>
            <button className={onlyUnread ? 'active' : ''} onClick={() => setOnlyUnread(true)}>No leídas ({unread})</button>
          </div>
          <button className="btn btn-subtle btn-small" disabled={unread === 0} onClick={onReadAll}>Marcar todas como leídas</button>
        </div>

        <div className="drawer-list">
          {visible.length === 0 ? (
            <div className="empty">{onlyUnread ? 'No tenés notificaciones sin leer.' : 'Todavía no hay notificaciones.'}</div>
          ) : visible.map(n => {
            const type = NOTIFICATION_TYPES[n.type] || { label: n.type, badge: 'gray' };
            return (
              <button key={n.id} className={`notification${n.isRead ? '' : ' unread'}`} onClick={() => onOpen(n)}>
                <span className="notification-top">
                  <span className={`badge ${type.badge}`}>{type.label}</span>
                  <span className="notification-time">{formatDateTime(n.createdAt)}</span>
                </span>
                <span className="notification-message">{n.message}</span>
                <span className="mono notification-code">{n.shipmentCode}</span>
              </button>
            );
          })}
        </div>
      </aside>
    </div>
  );
}
