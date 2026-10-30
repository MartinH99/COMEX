import { useEffect, useState } from 'react';
import { apiFetch } from './api';
import { CLIENT_NAV, Sidebar } from './components/Sidebar';
import { ShipmentList } from './components/ShipmentList';
import { ProspectList } from './components/ProspectList';
import Home from './components/Home';

// Vista de solo lectura para clientes; la API solo devuelve datos de su propia empresa
export default function ClientPortal({ user, onLogout }) {
  const [tab, setTab] = useState('shipments');
  const [clients, setClients] = useState([]);
  const [shipments, setShipments] = useState([]);
  const [prospects, setProspects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [focus, setFocus] = useState({ key: 0, shipmentId: null });

  const isPending = user.status === 'pending';

  useEffect(() => {
    if (isPending) return;

    async function fetchData() {
      try {
        const responses = await Promise.all([
          apiFetch('/api/clients'),
          apiFetch('/api/shipments'),
          apiFetch('/api/prospectos')
        ]);
        if (responses.some(response => !response.ok)) throw new Error('Error al conectar con la API');

        const [dataClients, dataShipments, dataProspects] = await Promise.all(responses.map(response => response.json()));
        setClients(dataClients);
        setShipments(dataShipments);
        setProspects(dataProspects);
      } catch (err) {
        console.error('Error cargando datos:', err);
        setError('No se pudieron cargar tus datos.');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [isPending]);

  const renderContent = () => {
    if (tab === 'home') return <Home setTab={setTab} homeTab="shipments" />;

    if (isPending) {
      return (
        <div className="section notice">
          <h2>Tu cuenta está pendiente de aprobación</h2>
          <p>
            Un administrador tiene que vincularla con {user.company}. Cuando lo haga, vas a ver acá tus embarques
            y prospectos. Volvé a ingresar más tarde.
          </p>
        </div>
      );
    }

    if (loading) return <div className="empty">Cargando tus datos…</div>;
    if (error) return <div className="empty">{error}</div>;

    if (tab === 'prospects') {
      return (
        <ProspectList
          readOnly
          prospects={prospects}
          onOpenShipment={shipmentId => {
            setFocus(prev => ({ key: prev.key + 1, shipmentId }));
            setTab('shipments');
          }}
        />
      );
    }

    return (
      <ShipmentList
        readOnly
        key={focus.key}
        shipments={shipments}
        clients={clients}
        initialOpenId={focus.shipmentId}
        activityVersion={0}
      />
    );
  };

  return (
    <div className="app-layout">
      <Sidebar items={CLIENT_NAV} currentTab={tab} setTab={setTab} user={user} onLogout={onLogout} />
      <main className={`main-content${tab === 'home' ? ' full' : ''}`}>{renderContent()}</main>
    </div>
  );
}
