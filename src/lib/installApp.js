import { useEffect, useState } from 'react';

// Chrome y Edge avisan una sola vez, al cargar, que la app se puede instalar: se guarda ese aviso
let deferredPrompt = null;
const listeners = new Set();
const notify = () => listeners.forEach(listener => listener());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notify();
  });
}

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

const isIos = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(error => console.error('No se pudo activar el modo app:', error));
  });
}

export function useInstallApp() {
  const [, setVersion] = useState(0);

  useEffect(() => {
    const listener = () => setVersion(version => version + 1);
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, []);

  const install = async () => {
    if (!deferredPrompt) return;
    const prompt = deferredPrompt;
    deferredPrompt = null;
    prompt.prompt();
    await prompt.userChoice;
    notify();
  };

  return { installed: isStandalone(), canInstall: Boolean(deferredPrompt), ios: isIos(), install };
}
