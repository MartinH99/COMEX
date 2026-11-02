import { useEffect, useRef } from 'react';
import './Home.css';

const icon = (paths) => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {paths.map(d => <path key={d} d={d} />)}
  </svg>
);

const features = [
  {
    icon: icon(['M12 21v-8', 'M12 13c0-4 3-7 8-7 0 5-3 8-8 7Z', 'M12 16c0-3-2-5-7-5 0 4 3 6 7 5Z']),
    title: 'Producción responsable',
    text: 'Prácticas agrícolas sustentables, uso eficiente del agua y manejo integrado de plagas en cada quinta.',
  },
  {
    icon: icon(['M3 21h18', 'M5 21V9l7-5 7 5v12', 'M9 21v-7h6v7', 'M9 10h6']),
    title: 'Empaque propio',
    text: 'Planta de empaque y cámaras de frío con atmósfera controlada para mantener la calidad hasta destino.',
  },
  {
    icon: icon(['M2 20c2 1 4 1 6 0s4-1 6 0 4 1 6 0', 'M4 16l-1-5h18l-2 5', 'M6 11V6h12v5', 'M12 6V2']),
    title: 'Exportación directa',
    text: 'Logística aérea, marítima y terrestre en contenedores reefer hacia Europa, América y Asia.',
  },
  {
    icon: icon(['M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6l7-3Z', 'M9 12l2 2 4-4']),
    title: 'Control de calidad',
    text: 'Seguimiento de cada lote desde la cosecha hasta el embarque.',
  },
];

const products = [
  { name: 'Kiwi Hayward Green', image: '/landing/kiwi-verde.webp', desc: 'La variedad clásica: pulpa verde, sabor equilibrado y excelente conservación.' },
  { name: 'Kiwi Orgánico', image: '/landing/kiwi-planta.webp', desc: 'Producción sin agroquímicos de síntesis, para mercados premium.' },
  { name: 'Kiwi Gold', image: '/landing/kiwi-oro.webp', desc: 'Pulpa amarilla, más dulce y con menos acidez. Alta demanda en Asia.' },
];

const steps = [
  { n: '01', title: 'Cosecha', text: 'Recolección manual en el punto óptimo de madurez y materia seca.' },
  { n: '02', title: 'Selección', text: 'Clasificación por calibre y calidad en la línea de empaque.' },
  { n: '03', title: 'Frío', text: 'Pre-enfriado y almacenamiento en cámaras de atmósfera controlada.' },
  { n: '04', title: 'Embarque', text: 'Consolidación en pallets y despacho al puerto de destino.' },
];

// Los bloques aparecen suavemente al entrar en pantalla; sin soporte se ven directamente
function useReveal() {
  const root = useRef(null);

  useEffect(() => {
    const elements = root.current.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) {
      elements.forEach(element => element.classList.add('is-visible'));
      return undefined;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    elements.forEach(element => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  return root;
}

export default function Home({ setTab, homeTab = 'dashboard' }) {
  const root = useReveal();
  const primaryLabel = homeTab === 'dashboard' ? 'Ir al Dashboard' : 'Ver mis embarques';

  return (
    <div className="home" ref={root}>
      <section className="home-hero">
        <div className="home-hero-photo" aria-hidden="true" />
        <div className="home-hero-content">
          <span className="home-eyebrow">Cooperativa agrícola</span>
          <h1>Del campo al mundo, <em>kiwi de calidad exportación</em></h1>
          <p>
            Somos una cooperativa de productores de kiwi que trabaja en conjunto para producir,
            empacar y exportar fruta fresca a los mercados más exigentes.
          </p>
          <div className="home-hero-actions">
            <button className="home-btn-primary" onClick={() => setTab(homeTab)}>{primaryLabel}</button>
            {homeTab === 'dashboard' && (
              <button className="home-btn-secondary" onClick={() => setTab('shipments')}>Ver embarques</button>
            )}
          </div>
        </div>
      </section>

      <section className="home-section home-about-section">
        <div className="home-about">
          <div className="home-about-text reveal">
            <span className="home-kicker">Quiénes somos</span>
            <h2>Productores que suman esfuerzos para llegar más lejos</h2>
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
          <div className="home-about-media reveal">
            <img src="/landing/huerto-retrato.webp" alt="Plantas de kiwi cargadas de fruta en un huerto" loading="lazy" />
            <div className="home-about-card">
              <h3>Nuestra misión</h3>
              <p>
                Producir y comercializar kiwi de excelencia, generando valor para nuestros asociados
                y sus comunidades, con respeto por el ambiente.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="home-section home-section-photo home-photo-orchard">
        <div className="home-heading reveal">
          <span className="home-kicker home-kicker-light">Qué hacemos</span>
          <h2>Cuidamos cada etapa, de la planta al contenedor</h2>
        </div>
        <div className="home-grid">
          {features.map(feature => (
            <article key={feature.title} className="home-card home-glass reveal">
              <span className="home-card-icon">{feature.icon}</span>
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="home-section">
        <div className="home-heading reveal">
          <span className="home-kicker">Nuestros productos</span>
          <h2>Tres formas de disfrutar el mejor kiwi</h2>
        </div>
        <div className="home-grid home-grid-3">
          {products.map(product => (
            <article key={product.name} className="home-product reveal">
              <div className="home-product-image">
                <img src={product.image} alt="" loading="lazy" />
              </div>
              <div className="home-product-body">
                <h3>{product.name}</h3>
                <p>{product.desc}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="home-section home-section-photo home-photo-ship">
        <div className="home-heading reveal">
          <span className="home-kicker">Nuestro proceso</span>
          <h2>Un recorrido simple y cuidado</h2>
        </div>
        <ol className="home-steps">
          {steps.map(step => (
            <li key={step.n} className="home-step reveal">
              <span className="home-step-n">{step.n}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <footer className="home-footer">
        <div className="home-footer-brand">
          <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
            <circle cx="16" cy="16" r="15" fill="#7A5A32" />
            <circle cx="16" cy="16" r="12.5" fill="#B7D84B" />
            <circle cx="16" cy="16" r="4" fill="#F4F7EC" />
          </svg>
          <span>COMEX</span>
        </div>
        <p>© {new Date().getFullYear()} Cooperativa de Productores de Kiwi. Todos los derechos reservados.</p>
        <p className="home-credits">
          Fotos de Wikimedia Commons: huerto de kiwi, Pseudopanax (dominio público); kiwi verde y Gold,{' '}
          <a href="https://commons.wikimedia.org/wiki/File:Kiwifruit_cross_section.jpg" target="_blank" rel="noreferrer">Ivar Leidus</a>,{' '}
          <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">CC BY-SA 4.0</a>, recortadas;
          carga marítima, recorte de{' '}
          <a href="https://commons.wikimedia.org/wiki/File:Container_ship_being_towed_in_the_Scheldt_towards_the_Port_of_Antwerp,_seen_from_Doel,_Belgium_(DSCF3880).jpg" target="_blank" rel="noreferrer">foto de Trougnouf</a>,{' '}
          <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>.
        </p>
      </footer>
    </div>
  );
}
