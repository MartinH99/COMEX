import './Home.css';
 
const stats = [
  { value: '+120', label: 'Productores asociados' },
  { value: '1.800', label: 'Hectáreas cultivadas' },
  { value: '+15', label: 'Países de destino' },
  { value: '35', label: 'Años de trayectoria' },
];
 
const features = [
  {
    icon: '🌱',
    title: 'Producción responsable',
    text: 'Prácticas agrícolas sustentables, uso eficiente del agua y manejo integrado de plagas en cada quinta.',
  },
  {
    icon: '🏭',
    title: 'Empaque propio',
    text: 'Planta de empaque y cámaras de frío con atmósfera controlada para mantener la calidad hasta destino.',
  },
  {
    icon: '🚢',
    title: 'Exportación directa',
    text: 'Logística aérea, marítima y terrestre en contenedores reefer hacia Europa, América y Asia.',
  },
  {
    icon: '✅',
    title: 'Calidad certificada',
    text: 'Trazabilidad completa del lote y certificaciones internacionales como GlobalG.A.P.',
  },
];
 
const products = [
  { name: 'Kiwi Hayward Green', desc: 'La variedad clásica: pulpa verde, sabor equilibrado y excelente conservación.' },
  { name: 'Kiwi Orgánico', desc: 'Producción certificada sin agroquímicos de síntesis, para mercados premium.' },
  { name: 'Kiwi Gold', desc: 'Pulpa amarilla, más dulce y con menos acidez. Alta demanda en Asia.' },
];
 
const steps = [
  { n: '01', title: 'Cosecha', text: 'Recolección manual en el punto óptimo de madurez y materia seca.' },
  { n: '02', title: 'Selección', text: 'Clasificación por calibre y calidad en la línea de empaque.' },
  { n: '03', title: 'Frío', text: 'Pre-enfriado y almacenamiento en cámaras de atmósfera controlada.' },
  { n: '04', title: 'Embarque', text: 'Consolidación en pallets y despacho al puerto de destino.' },
];
 
export default function Home({ setTab, homeTab = 'dashboard' }) {
  return (
    <div className="home">
      {/* HERO */}
      <section className="home-hero">
        <div className="home-hero-content">
          <span className="home-badge">🥝 Cooperativa Agrícola</span>
          <h1>Del campo al mundo, kiwi de calidad exportación</h1>
          <p>
            Somos una cooperativa de productores de kiwi que trabaja en conjunto para producir,
            empacar y exportar fruta fresca a los mercados más exigentes.
          </p>
          <div className="home-hero-actions">
            <button className="home-btn-primary" onClick={() => setTab(homeTab)}>
              {homeTab === 'dashboard' ? 'Ir al Dashboard' : 'Ver mis embarques'}
            </button>
            <button className="home-btn-secondary" onClick={() => setTab('shipments')}>
              Ver Embarques
            </button>
          </div>
        </div>
      </section>
 
      {/* STATS */}
      <section className="home-stats">
        {stats.map(s => (
          <div key={s.label} className="home-stat">
            <span className="home-stat-value">{s.value}</span>
            <span className="home-stat-label">{s.label}</span>
          </div>
        ))}
      </section>
 
      {/* QUIÉNES SOMOS */}
      <section className="home-section">
        <div className="home-about">
          <div>
            <h2>Quiénes somos</h2>
            <p>
              Nacimos de la unión de pequeños y medianos productores que decidieron sumar esfuerzos
              para competir en el mercado internacional. Hoy compartimos infraestructura, conocimiento
              técnico y canales comerciales.
            </p>
            <p>
              Nuestro modelo cooperativo garantiza un precio justo para cada socio y una relación de
              largo plazo con nuestros clientes en el exterior.
            </p>
          </div>
          <div className="home-about-card">
            <h3>Nuestra misión</h3>
            <p>
              Producir y comercializar kiwi de excelencia, generando valor para nuestros asociados
              y sus comunidades, con respeto por el ambiente.
            </p>
          </div>
        </div>
      </section>
 
      {/* QUÉ HACEMOS */}
      <section className="home-section home-section-alt">
        <h2 className="home-center">Qué hacemos</h2>
        <div className="home-grid">
          {features.map(f => (
            <div key={f.title} className="home-card">
              <span className="home-card-icon">{f.icon}</span>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </div>
          ))}
        </div>
      </section>
 
      {/* PRODUCTOS */}
      <section className="home-section">
        <h2 className="home-center">Nuestros productos</h2>
        <div className="home-grid home-grid-3">
          {products.map(p => (
            <div key={p.name} className="home-card home-product">
              <h3>{p.name}</h3>
              <p>{p.desc}</p>
            </div>
          ))}
        </div>
      </section>
 
      {/* PROCESO */}
      <section className="home-section home-section-alt">
        <h2 className="home-center">Nuestro proceso</h2>
        <div className="home-grid">
          {steps.map(s => (
            <div key={s.n} className="home-step">
              <span className="home-step-n">{s.n}</span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </div>
          ))}
        </div>
      </section>
 
      {/* CONTACTO */}
      <section className="home-cta">
        <h2>¿Querés importar nuestro kiwi?</h2>
        <p>Escribinos y nuestro equipo comercial te va a contactar.</p>
        <div className="home-contact">
          <span>📧 comercial@cooperativakiwi.com</span>
          <span>📞 +54 9 11 0000-0000</span>
          <span>📍 Argentina</span>
        </div>
      </section>
 
      <footer className="home-footer">
        © {new Date().getFullYear()} Cooperativa de Productores de Kiwi. Todos los derechos reservados.
      </footer>
    </div>
  );
}