export const SESSION_EXPIRED_EVENT = 'comex:session-expired';

// fetch que avisa a la app cuando la sesión venció, para volver a la pantalla de ingreso
export async function apiFetch(url, options) {
  const response = await fetch(url, options);
  if (response.status === 401) {
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  }
  return response;
}
