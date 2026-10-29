import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { Dashboard } from './components/Dashboard';
import { ShipmentForm } from './components/ShipmentForm';
import Home from './components/Home';
import { CALIBERS_MASTER } from './data/mockData';
import './index.css';

export default function App() {
  const [tab, setTab] = useState('home');
  const [clients, setClients] = useState([]);
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Cargar datos del servidor al iniciar
  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        setError(null);
        const [resClients, resShipments] = await Promise.all([
          fetch('/api/clients'),
          fetch('/api/shipments')
        ]);

        if (!resClients.ok || !resShipments.ok) {
          throw new Error('Error al conectar con la API');
        }

        const dataClients = await resClients.json();
        const dataShipments = await resShipments.json();

        setClients(dataClients);
        setShipments(dataShipments);
      } catch (err) {
        console.error('Error cargando datos:', err);
        setError('No se pudo conectar con el servidor backend.');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

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
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleDeleteShipment = async (id) => {
    if (!window.confirm('¿Seguro que deseas eliminar este embarque?')) return;

    try {
      const response = await fetch(`/api/shipments/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('No se pudo eliminar');

      setShipments(prev => prev.filter(s => s.id !== id));
    } catch (err) {
      alert(`Error al eliminar: ${err.message}`);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', fontFamily: 'sans-serif' }}>
        <h2>🔄 Cargando datos del sistema COMEX...</h2>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'red', fontFamily: 'sans-serif' }}>
        <h2>⚠️ {error}</h2>
        <p>Asegúrate de que el servidor API esté corriendo con <code>npm run server</code>.</p>
      </div>
    );
  }

  return (
    <div className="app-layout">
      <Header currentTab={tab} setTab={setTab} />

      {/* Landing: va fuera del <main> para que ocupe todo el ancho */}
      {tab === 'home' && <Home setTab={setTab} />}

      {tab !== 'home' && (
      <main className="main-content">
        {tab === 'dashboard' && <Dashboard shipments={shipments} clients={clients} />}
        {tab === 'new-shipment' && <ShipmentForm clients={clients} onSave={handleAddShipment} />}
        {tab === 'shipments' && (
          <div className="card">
            <h2>📦 Listado de Embarques Comercial</h2>
            <table>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Cliente</th>
                  <th>Condición</th>
                  <th>Cajas / Pallets</th>
                  <th>Total USD</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {shipments.map(s => {
                  const client = clients.find(c => c.id === s.clientId);
                  return (
                    <tr key={s.id}>
                      <td><strong>{s.code}</strong></td>
                      <td>{client?.company || 'N/A'}</td>
                      <td>{s.condition} ({s.deal})</td>
                      <td>{s.boxes} cjs ({(s.boxes / 104).toFixed(1)} pallets)</td>
                      <td><strong>${s.totalUsd?.toLocaleString()} USD</strong></td>
                      <td>
                        <button 
                          className="btn btn-secondary" 
                          style={{ padding: '0.2rem 0.5rem', color: 'red' }}
                          onClick={() => handleDeleteShipment(s.id)}
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {tab === 'calibers' && (
          <div className="card">
            <h2>🏷️ Matriz Oficial de 12 Calibres</h2>
            <table>
              <thead>
                <tr>
                  <th>Calibre</th>
                  <th>Frutos / Caja 10kg</th>
                  <th>Peso Fruto</th>
                  <th>Precio Referencia USD</th>
                </tr>
              </thead>
              <tbody>
                {CALIBERS_MASTER.map(c => (
                  <tr key={c.code}>
                    <td><strong>{c.code} ({c.label})</strong></td>
                    <td>{c.fruitsBox} unidades</td>
                    <td>{c.avgWeightGrams} g</td>
                    <td>${c.defaultPriceKg.toFixed(2)} USD / Kg</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {tab === 'clients' && (
          <div className="card">
            <h2>👥 Clientes Registrados CRM</h2>
            <table>
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>País</th>
                  <th>Contacto</th>
                  <th>Calificación</th>
                  <th>Condición de Pago Habitual</th>
                </tr>
              </thead>
              <tbody>
                {clients.map(c => (
                  <tr key={c.id}>
                    <td><strong>{c.company}</strong></td>
                    <td>{c.country}</td>
                    <td>{c.contact}</td>
                    <td>{'⭐'.repeat(c.rating)}</td>
                    <td>{c.defaultPayment}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
      )}
    </div>
  );
}