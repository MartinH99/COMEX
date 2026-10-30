import { useState, useEffect, useRef, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { NotificationCenter } from './components/NotificationCenter';
import { Dashboard } from './components/Dashboard';
import { ShipmentForm } from './components/ShipmentForm';
import { ShipmentList } from './components/ShipmentList';
import { ProspectList } from './components/ProspectList';
import { ProspectForm } from './components/ProspectForm';
import { ClientList } from './components/ClientList';
import { CaliberList } from './components/CaliberList';
import { ConfirmModal, Toasts } from './components/ui';
import Home from './components/Home';
import './index.css';

const NOTIFICATIONS_POLL_MS = 60000;

export default function App() {
  const [tab, setTab] = useState('dashboard');
  const [clients, setClients] = useState([]);
  const [shipments, setShipments] = useState([]);
  const [products, setProducts] = useState([]);
  const [prospects, setProspects] = useState([]);
  const [editingProspect, setEditingProspect] = useState(null);
  const [prospectToDelete, setProspectToDelete] = useState(null);
  // Datos del prospecto con los que se precarga el formulario de embarque
  const [shipmentDraft, setShipmentDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [shipmentToDelete, setShipmentToDelete] = useState(null);
  const nextToastId = useRef(0);
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const [activityVersion, setActivityVersion] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  // Abre un embarque al venir de una notificación; focus.key remonta la lista para aplicarlo
  const [focus, setFocus] = useState({ key: 0, shipmentId: null });

  const refreshNotifications = useCallback(async () => {
    try {
      const response = await fetch('/api/notifications');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setNotifications(data.items);
      setUnread(data.unread);
      setActivityVersion(version => version + 1);
    } catch (err) {
      // Es un refresco en segundo plano: se reintenta en el próximo ciclo
      console.warn('No se pudieron actualizar las notificaciones:', err);
    }
  }, []);

  useEffect(() => {
    const refreshIfVisible = () => {
      if (!document.hidden) refreshNotifications();
    };

    refreshIfVisible();
    const interval = setInterval(refreshIfVisible, NOTIFICATIONS_POLL_MS);
    document.addEventListener('visibilitychange', refreshIfVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshIfVisible);
    };
  }, [refreshNotifications]);

  const showToast = (message, type = '') => {
    const id = nextToastId.current++;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  };

  // Cargar datos del servidor al iniciar
  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        setError(null);
        const [resClients, resShipments, resProducts, resProspects] = await Promise.all([
          fetch('/api/clients'),
          fetch('/api/shipments'),
          fetch('/api/products'),
          fetch('/api/prospectos')
        ]);

        if (!resClients.ok || !resShipments.ok || !resProducts.ok || !resProspects.ok) {
          throw new Error('Error al conectar con la API');
        }

        const dataClients = await resClients.json();
        const dataShipments = await resShipments.json();
        const dataProducts = await resProducts.json();
        const dataProspects = await resProspects.json();

        setClients(dataClients);
        setShipments(dataShipments);
        setProducts(dataProducts);
        setProspects(dataProspects);
      } catch (err) {
        console.error('Error cargando datos:', err);
        setError('No se pudo conectar con el servidor.');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  const refreshProspects = async () => {
    try {
      const response = await fetch('/api/prospectos');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setProspects(await response.json());
    } catch (err) {
      showToast(`No se pudieron actualizar los prospectos: ${err.message}`, 'error');
    }
  };

  const handleAddShipment = async (shipmentData) => {
    try {
      const response = await fetch('/api/shipments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(shipmentData)
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Error al guardar embarque');
      }

      const savedShipment = await response.json();
      setShipments(prev => [savedShipment, ...prev]);
      setTab('shipments');
      setShipmentDraft(null);
      showToast(`Embarque ${savedShipment.code} registrado`, 'ok');
      refreshNotifications();
      if (shipmentData.prospectId) refreshProspects();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // POST/PATCH con aviso de error; devuelve el registro guardado o null para que el formulario siga abierto
  const sendJson = async (url, method, body) => {
    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo guardar');
      return data;
    } catch (err) {
      showToast(err.message, 'error');
      return null;
    }
  };

  const handleSaveProspect = async (prospectData) => {
    const saved = editingProspect
      ? await sendJson(`/api/prospectos/${editingProspect.id}`, 'PUT', prospectData)
      : await sendJson('/api/prospectos', 'POST', prospectData);
    if (saved) {
      setProspects(prev => (editingProspect
        ? prev.map(p => (p.id === saved.id ? saved : p))
        : [saved, ...prev]));
      setEditingProspect(null);
      setTab('prospects');
      showToast(`Prospecto ${saved.company} guardado`, 'ok');
    }
  };

  const handleDeleteProspect = async () => {
    const { id, company } = prospectToDelete;
    setProspectToDelete(null);

    try {
      const response = await fetch(`/api/prospectos/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('No se pudo eliminar');

      setProspects(prev => prev.filter(p => p.id !== id));
      showToast(`Prospecto ${company} eliminado`, 'ok');
    } catch (err) {
      showToast(`Error al eliminar: ${err.message}`, 'error');
    }
  };

  // Un embarque necesita un cliente: si la empresa es nueva, se da de alta antes de abrir el formulario
  const handleCreateShipmentFromProspect = async (prospect) => {
    const result = await sendJson(`/api/prospectos/${prospect.id}/client`, 'POST', {});
    if (!result) return;

    const { client, created } = result;
    if (created) {
      setClients(prev => [...prev, client].sort((a, b) => a.company.localeCompare(b.company)));
      showToast(`${client.company} se agregó a Clientes`, 'ok');
    }
    setProspects(prev => prev.map(p => (p.id === prospect.id ? { ...p, clientId: client.id } : p)));
    setShipmentDraft({ ...prospect, prospectId: prospect.id, clientId: client.id });
    setTab('new-shipment');
  };

  const handleCreateClient = async (clientData) => {
    const created = await sendJson('/api/clients', 'POST', clientData);
    if (created) {
      setClients(prev => [...prev, created].sort((a, b) => a.company.localeCompare(b.company)));
      showToast(`Cliente ${created.company} creado`, 'ok');
    }
    return created;
  };

  const handleCreateProduct = async (name) => {
    const created = await sendJson('/api/products', 'POST', { name });
    if (created) {
      setProducts(prev => [...prev, created]);
      showToast(`Producto ${created.name} creado`, 'ok');
    }
    return created;
  };

  const handleRegisterDelivery = async (id, deliveredBoxes) => {
    const updated = await sendJson(`/api/shipments/${id}/delivery`, 'PATCH', { deliveredBoxes });
    if (updated) {
      setShipments(prev => prev.map(s => (s.id === id ? { ...s, ...updated } : s)));
      showToast(`Entrega de ${updated.code} registrada`, 'ok');
      refreshNotifications();
    }
    return updated;
  };

  const handleChangeStatus = async (id, status) => {
    const updated = await sendJson(`/api/shipments/${id}/status`, 'PATCH', { status });
    if (updated) {
      setShipments(prev => prev.map(s => (s.id === id ? { ...s, ...updated } : s)));
      showToast(`${updated.code}: estado ${updated.status}`, 'ok');
      refreshNotifications();
    }
  };

  const handleAddFollowUp = async (id, note) => {
    const saved = await sendJson(`/api/shipments/${id}/followups`, 'POST', { note });
    if (saved) refreshNotifications();
    return saved;
  };

  const handleOpenNotification = (notification) => {
    if (!notification.isRead) {
      setNotifications(prev => prev.map(n => (n.id === notification.id ? { ...n, isRead: 1 } : n)));
      setUnread(prev => Math.max(0, prev - 1));
      fetch(`/api/notifications/${notification.id}/read`, { method: 'PATCH' })
        .catch(err => console.warn('No se pudo marcar como leída:', err));
    }
    if (notification.shipmentId) {
      setFocus(prev => ({ key: prev.key + 1, shipmentId: notification.shipmentId }));
      setTab('shipments');
      setShowNotifications(false);
    }
  };

  const handleReadAll = async () => {
    const saved = await sendJson('/api/notifications/read-all', 'POST', {});
    if (saved) refreshNotifications();
  };

  const handleDeleteShipment = async () => {
    const { id, code } = shipmentToDelete;
    setShipmentToDelete(null);

    try {
      const response = await fetch(`/api/shipments/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('No se pudo eliminar');

      setShipments(prev => prev.filter(s => s.id !== id));
      showToast(`Embarque ${code} eliminado`, 'ok');
      refreshNotifications();
      refreshProspects();
    } catch (err) {
      showToast(`Error al eliminar: ${err.message}`, 'error');
    }
  };

  const openBlankShipmentForm = () => {
    setShipmentDraft(null);
    setTab('new-shipment');
  };

  if (loading) {
    return <div className="status-screen">Cargando datos del sistema…</div>;
  }

  if (error) {
    return (
      <div className="status-screen">
        <h2>{error}</h2>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>Reintentar</button>
      </div>
    );
  }

  return (
    <div className="app-layout">
      <Sidebar
        currentTab={tab}
        setTab={setTab}
        unread={unread}
        onOpenNotifications={() => setShowNotifications(true)}
      />

      {/* La landing va sin padding para que ocupe todo el ancho */}
      <main className={`main-content${tab === 'home' ? ' full' : ''}`}>
        {tab === 'home' && <Home setTab={setTab} />}
        {tab === 'dashboard' && (
          <Dashboard
            shipments={shipments}
            clients={clients}
            onNew={openBlankShipmentForm}
            onViewAll={() => setTab('shipments')}
          />
        )}
        {tab === 'prospects' && (
          <ProspectList
            prospects={prospects}
            onNew={() => { setEditingProspect(null); setTab('prospect-form'); }}
            onEdit={prospect => { setEditingProspect(prospect); setTab('prospect-form'); }}
            onDelete={setProspectToDelete}
            onCreateShipment={handleCreateShipmentFromProspect}
            onOpenShipment={shipmentId => {
              setFocus(prev => ({ key: prev.key + 1, shipmentId }));
              setTab('shipments');
            }}
          />
        )}
        {tab === 'prospect-form' && (
          <ProspectForm
            key={editingProspect?.id ?? 'new'}
            prospect={editingProspect}
            clients={clients}
            products={products}
            onSave={handleSaveProspect}
            onCancel={() => setTab('prospects')}
            onCreateProduct={handleCreateProduct}
          />
        )}
        {tab === 'new-shipment' && (
          <ShipmentForm
            key={shipmentDraft?.prospectId ?? 'new'}
            clients={clients}
            products={products}
            draft={shipmentDraft}
            onSave={handleAddShipment}
            onCancel={() => setTab(shipmentDraft ? 'prospects' : 'shipments')}
            onError={message => showToast(message, 'error')}
            onCreateProduct={handleCreateProduct}
          />
        )}
        {tab === 'shipments' && (
          <ShipmentList
            key={focus.key}
            shipments={shipments}
            clients={clients}
            initialOpenId={focus.shipmentId}
            activityVersion={activityVersion}
            onNew={openBlankShipmentForm}
            onDelete={setShipmentToDelete}
            onRegisterDelivery={handleRegisterDelivery}
            onChangeStatus={handleChangeStatus}
            onAddFollowUp={handleAddFollowUp}
          />
        )}
        {tab === 'clients' && <ClientList clients={clients} onCreate={handleCreateClient} />}
        {tab === 'calibers' && <CaliberList />}
      </main>

      {shipmentToDelete && (
        <ConfirmModal
          title="Eliminar embarque"
          message={`Se va a eliminar el embarque ${shipmentToDelete.code} con su detalle de calibres. Esta acción no se puede deshacer.`}
          confirmLabel="Eliminar"
          onConfirm={handleDeleteShipment}
          onCancel={() => setShipmentToDelete(null)}
        />
      )}
      {prospectToDelete && (
        <ConfirmModal
          title="Eliminar prospecto"
          message={`Se va a eliminar el prospecto de ${prospectToDelete.company}. Esta acción no se puede deshacer.`}
          confirmLabel="Eliminar"
          onConfirm={handleDeleteProspect}
          onCancel={() => setProspectToDelete(null)}
        />
      )}
      {showNotifications && (
        <NotificationCenter
          notifications={notifications}
          unread={unread}
          onOpen={handleOpenNotification}
          onReadAll={handleReadAll}
          onClose={() => setShowNotifications(false)}
        />
      )}
      <Toasts toasts={toasts} />
    </div>
  );
}
