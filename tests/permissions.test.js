// Prueba la API real contra una base temporal: nunca toca server/comex.db ni Turso.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'comex-test-'));
const ADMIN_PASSWORD = randomBytes(16).toString('hex');

process.env.TURSO_DATABASE_URL = pathToFileURL(path.join(tempDir, 'test.db')).href;
delete process.env.TURSO_AUTH_TOKEN;
delete process.env.VERCEL;
process.env.ADMIN_USERNAME = 'admin-test';
process.env.ADMIN_PASSWORD = ADMIN_PASSWORD;
process.env.DOCUMENTS_DIR = path.join(tempDir, 'documentos');
delete process.env.BLOB_STORE_ID;
delete process.env.BLOB_READ_WRITE_TOKEN;

const { default: app } = await import('../server/app.js');
const { default: db } = await import('../server/db.js');
const { getFinance } = await import('../src/lib/finance.js');

let server;
let baseUrl;

function createSession() {
  let cookie = '';
  const session = async (route, method = 'GET', body) => {
    const response = await fetch(baseUrl + route, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    const text = await response.text();
    let data = text;
    try { data = JSON.parse(text); } catch { /* respuesta sin JSON, como un 404 de Express */ }
    return { status: response.status, data, text, setCookie };
  };
  session.cookie = () => cookie;
  session.raw = async (route, buffer) => {
    const response = await fetch(baseUrl + route, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream', cookie },
      body: buffer
    });
    const text = await response.text();
    let data = text;
    try { data = JSON.parse(text); } catch { /* sin JSON */ }
    return { status: response.status, data, text };
  };
  return session;
}

const fetchRaw = (session, route) => fetch(baseUrl + route, { headers: session.cookie() ? { cookie: session.cookie() } : {} });

const newShipment = (clientId, product = 'Kiwi') => ({
  clientId, product, condition: 'Venta', deal: 'Precio Cerrado', loadWeek: 20, port: 'Rotterdam', paymentTerms: '30 días',
  boxes: 10, totalUsd: 1000, deliveryDate: '2030-01-15', calibres: { C30: { boxes: 10, priceKg: 10 } }
});

let admin;
let clientA;
let clientB;
let pending;
let companyA;
let companyB;
let shipmentA;
let shipmentB;
let prospectA;
let prospectB;
let draftA;

// Todas las pruebas salen de la misma IP: se libera el cupo de registros para no chocar con el límite
async function registerClient(username, company) {
  await db.execute("DELETE FROM rate_limits WHERE key LIKE 'register:%'");
  const session = createSession();
  const response = await session('/api/auth/register', 'POST', {
    username, password: 'clave-de-prueba-1', fullName: 'Persona de prueba', company, country: 'AR', email: `${username}@example.com`
  });
  assert.equal(response.status, 201);
  return { session, id: response.data.id };
}

before(async () => {
  await new Promise(resolve => { server = app.listen(0, resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  admin = createSession();
  const login = await admin('/api/auth/login', 'POST', { username: 'admin-test', password: ADMIN_PASSWORD });
  assert.equal(login.status, 200);

  companyA = (await admin('/api/clients', 'POST', { company: 'Empresa A', country: 'AR', contact: 'A', defaultPayment: 'x' })).data;
  companyB = (await admin('/api/clients', 'POST', { company: 'Empresa B', country: 'CL', contact: 'B', defaultPayment: 'x' })).data;

  shipmentA = (await admin('/api/shipments', 'POST', newShipment(companyA.id))).data;
  shipmentB = (await admin('/api/shipments', 'POST', newShipment(companyB.id))).data;

  await admin(`/api/shipments/${shipmentA.id}/costs`, 'POST', { category: 'Flete', amountUsd: 200 });
  await admin(`/api/shipments/${shipmentA.id}/payments`, 'POST', { amountUsd: 300, paidAt: '2030-01-01' });
  await admin(`/api/shipments/${shipmentA.id}/followups`, 'POST', { note: 'SEGUIMIENTO-INTERNO' });

  prospectA = (await admin('/api/prospectos', 'POST', { clientId: companyA.id, status: 'Cotizado', notes: 'NOTA-INTERNA', calibres: {} })).data;
  draftA = (await admin('/api/prospectos', 'POST', { clientId: companyA.id, status: 'Nuevo', calibres: {} })).data;
  prospectB = (await admin('/api/prospectos', 'POST', { clientId: companyB.id, status: 'Cotizado', calibres: {} })).data;

  const a = await registerClient('cliente-a', 'Empresa A');
  clientA = a.session;
  await admin(`/api/users/${a.id}`, 'PATCH', { clientId: companyA.id });

  const b = await registerClient('cliente-b', 'Empresa B');
  clientB = b.session;
  await admin(`/api/users/${b.id}`, 'PATCH', { clientId: companyB.id });

  pending = (await registerClient('cliente-pendiente', 'Empresa A')).session;
});

after(async () => {
  await new Promise(resolve => server.close(resolve));
  db.close();
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // En Windows el archivo puede seguir bloqueado un momento; la carpeta es temporal y no afecta el resultado
  }
});

describe('sin sesión', () => {
  const routes = [
    ['GET', '/api/auth/me'], ['GET', '/api/clients'], ['GET', '/api/shipments'], ['GET', '/api/prospectos'],
    ['GET', '/api/products'], ['GET', '/api/notifications'], ['GET', '/api/users'], ['GET', '/api/shipments/1/finance'],
    ['POST', '/api/clients'], ['POST', '/api/shipments'], ['DELETE', '/api/shipments/1'], ['PUT', '/api/shipments/1'],
    ['PATCH', '/api/users/1'], ['POST', '/api/shipments/1/payments']
  ];
  for (const [method, route] of routes) {
    test(`${method} ${route} responde 401`, async () => {
      const session = createSession();
      const response = await session(route, method, method === 'GET' || method === 'DELETE' ? undefined : {});
      assert.equal(response.status, 401);
    });
  }
});

describe('sesión y contraseñas', () => {
  test('la cookie es HttpOnly y SameSite', async () => {
    const response = await createSession()('/api/auth/login', 'POST', { username: 'admin-test', password: ADMIN_PASSWORD });
    assert.match(response.setCookie, /HttpOnly/);
    assert.match(response.setCookie, /SameSite=Lax/);
  });

  test('ninguna respuesta incluye el hash de la contraseña', async () => {
    const users = await admin('/api/users');
    assert.equal(users.status, 200);
    assert.doesNotMatch(users.text, /scrypt|password/i);
  });

  test('un registro no puede darse permisos enviándolos', async () => {
    const response = await createSession()('/api/auth/register', 'POST', {
      username: 'intruso', password: 'clave-de-prueba-1', fullName: 'X', company: 'X', country: 'X', email: 'x@example.com',
      role: 'admin', status: 'active', clientId: 1
    });
    assert.equal(response.status, 201);
    assert.equal(response.data.role, 'client');
    assert.equal(response.data.status, 'pending');
    assert.equal(response.data.clientId, null);
  });

  test('se bloquea tras 5 intentos fallidos, aun con la clave correcta', async () => {
    await registerClient('bloqueo', 'X');
    const session = createSession();
    for (let i = 0; i < 5; i++) {
      assert.equal((await session('/api/auth/login', 'POST', { username: 'bloqueo', password: 'incorrecta' })).status, 401);
    }
    assert.equal((await session('/api/auth/login', 'POST', { username: 'bloqueo', password: 'clave-de-prueba-1' })).status, 429);
  });

  test('un bloqueo desde otra IP no deja afuera al dueño de la cuenta', async () => {
    await db.execute({
      sql: 'INSERT INTO rate_limits (key, count, reset_at) VALUES (?, 50, ?)',
      args: ['login:admin-test:203.0.113.9', new Date(Date.now() + 60000).toISOString()]
    });
    const session = createSession();
    assert.equal((await session('/api/auth/login', 'POST', { username: 'admin-test', password: ADMIN_PASSWORD })).status, 200);
  });

  test('frena muchos intentos fallidos desde una IP, aunque sean a cuentas distintas', async () => {
    await db.execute("DELETE FROM rate_limits WHERE key LIKE 'login-ip:%'");
    const session = createSession();
    try {
      for (let i = 0; i < 20; i++) {
        assert.equal((await session('/api/auth/login', 'POST', { username: `inventado-${i}`, password: 'incorrecta' })).status, 401);
      }
      assert.equal((await session('/api/auth/login', 'POST', { username: 'admin-test', password: ADMIN_PASSWORD })).status, 429);
    } finally {
      await db.execute("DELETE FROM rate_limits WHERE key LIKE 'login%'");
    }
  });

  test('limita la cantidad de cuentas nuevas por IP', async () => {
    await db.execute("DELETE FROM rate_limits WHERE key LIKE 'register:%'");
    try {
      for (let i = 0; i < 10; i++) {
        const response = await createSession()('/api/auth/register', 'POST', {
          username: `masivo-${i}`, password: 'clave-de-prueba-1', fullName: 'X', company: 'X', country: 'X', email: 'x@example.com'
        });
        assert.equal(response.status, 201);
      }
      const blocked = await createSession()('/api/auth/register', 'POST', {
        username: 'masivo-extra', password: 'clave-de-prueba-1', fullName: 'X', company: 'X', country: 'X', email: 'x@example.com'
      });
      assert.equal(blocked.status, 429);
    } finally {
      await db.execute("DELETE FROM rate_limits WHERE key LIKE 'register:%'");
    }
  });

  test('restablecer la clave libera el bloqueo de la cuenta', async () => {
    const { id } = await registerClient('desbloqueo', 'X');
    const session = createSession();
    for (let i = 0; i < 5; i++) await session('/api/auth/login', 'POST', { username: 'desbloqueo', password: 'incorrecta' });
    assert.equal((await session('/api/auth/login', 'POST', { username: 'desbloqueo', password: 'clave-de-prueba-1' })).status, 429);
    await admin(`/api/users/${id}`, 'PATCH', { password: 'clave-nueva-123' });
    assert.equal((await session('/api/auth/login', 'POST', { username: 'desbloqueo', password: 'clave-nueva-123' })).status, 200);
    await db.execute("DELETE FROM rate_limits WHERE key LIKE 'login-ip:%'");
  });

  test('la API no anuncia la tecnología del servidor', async () => {
    const response = await fetch(`${baseUrl}/api/auth/me`);
    assert.equal(response.headers.get('x-powered-by'), null);
  });

  test('cerrar sesión invalida la sesión', async () => {
    const session = createSession();
    await session('/api/auth/login', 'POST', { username: 'admin-test', password: ADMIN_PASSWORD });
    await session('/api/auth/logout', 'POST');
    assert.equal((await session('/api/auth/me')).status, 401);
  });

  test('deshabilitar una cuenta corta su sesión al instante', async () => {
    const { session, id } = await registerClient('a-deshabilitar', 'X');
    assert.equal((await session('/api/auth/me')).status, 200);
    await admin(`/api/users/${id}`, 'PATCH', { status: 'disabled' });
    assert.equal((await session('/api/shipments')).status, 401);
  });
});

describe('aislamiento entre clientes', () => {
  test('una cuenta pendiente no ve datos', async () => {
    for (const route of ['/api/clients', '/api/shipments', '/api/prospectos']) {
      assert.deepEqual((await pending(route)).data, []);
    }
  });

  test('cada cliente ve solo su empresa', async () => {
    const clients = (await clientA('/api/clients')).data;
    assert.deepEqual(clients.map(c => c.id), [companyA.id]);
  });

  test('cada cliente ve solo sus embarques', async () => {
    const mine = (await clientA('/api/shipments')).data;
    assert.ok(mine.length > 0);
    assert.ok(mine.every(s => s.clientId === companyA.id));
    assert.ok(!mine.some(s => s.id === shipmentB.id));
  });

  test('el historial de un embarque ajeno viene vacío', async () => {
    assert.deepEqual((await clientA(`/api/shipments/${shipmentB.id}/notifications`)).data, []);
  });

  test('cada cliente ve solo sus prospectos, sin borradores', async () => {
    const ids = (await clientA('/api/prospectos')).data.map(p => p.id);
    assert.ok(ids.includes(prospectA.id));
    assert.ok(!ids.includes(prospectB.id));
    assert.ok(!ids.includes(draftA.id));
    assert.ok((await clientB('/api/prospectos')).data.every(p => p.id !== prospectA.id));
  });
});

describe('información interna', () => {
  test('el cliente no recibe costos ni cobros en sus embarques', async () => {
    const response = await clientA('/api/shipments');
    assert.doesNotMatch(response.text, /costsUsd|paidUsd/);
    const shipment = (await admin('/api/shipments')).data.find(s => s.id === shipmentA.id);
    assert.equal(shipment.costsUsd, 200);
    assert.equal(shipment.paidUsd, 300);
  });

  test('el cliente no ve seguimientos ni cobros en el historial', async () => {
    const response = await clientA(`/api/shipments/${shipmentA.id}/notifications`);
    assert.equal(response.status, 200);
    assert.doesNotMatch(response.text, /SEGUIMIENTO-INTERNO|Cobro/);
  });

  test('el cliente no ve notas de prospectos', async () => {
    assert.doesNotMatch((await clientA('/api/prospectos')).text, /NOTA-INTERNA/);
  });
});

describe('acciones reservadas al admin', () => {
  const forbidden = () => [
    ['GET', '/api/users'], ['GET', '/api/notifications'], ['GET', '/api/products'],
    ['GET', `/api/shipments/${shipmentA.id}/finance`],
    ['POST', `/api/shipments/${shipmentA.id}/costs`, { category: 'x', amountUsd: 1 }],
    ['POST', `/api/shipments/${shipmentA.id}/payments`, { amountUsd: 1, paidAt: '2030-01-01' }],
    ['POST', '/api/clients', { company: 'x', country: 'x', contact: 'x' }],
    ['PUT', `/api/clients/${companyA.id}`, { company: 'x', country: 'x', contact: 'x' }],
    ['DELETE', `/api/clients/${companyA.id}`],
    ['POST', '/api/shipments', newShipment(companyA.id)],
    ['PUT', `/api/shipments/${shipmentA.id}`, newShipment(companyA.id)],
    ['DELETE', `/api/shipments/${shipmentA.id}`],
    ['PATCH', `/api/shipments/${shipmentA.id}/status`, { status: 'Entregado' }],
    ['PATCH', `/api/shipments/${shipmentA.id}/delivery`, { deliveredBoxes: 1 }],
    ['POST', `/api/shipments/${shipmentA.id}/followups`, { note: 'x' }],
    ['POST', '/api/prospectos', { product: 'x' }],
    ['PUT', `/api/prospectos/${prospectA.id}`, { product: 'x' }],
    ['DELETE', `/api/prospectos/${prospectA.id}`],
    ['POST', `/api/prospectos/${prospectA.id}/client`, {}],
    ['POST', '/api/products', { name: 'x' }],
    ['POST', '/api/notifications/read-all', {}],
    ['PATCH', '/api/users/1', { password: 'clave-hackeada-1' }],
    ['GET', '/API/USERS'],
    ['GET', '/api/users/']
  ];

  test('un cliente recibe 403 en todas', async () => {
    for (const [method, route, body] of forbidden()) {
      const response = await clientA(route, method, body);
      assert.equal(response.status, 403, `${method} ${route} respondió ${response.status}`);
    }
  });

  test('un cliente no puede vincularse solo a otra empresa', async () => {
    const me = (await clientA('/api/auth/me')).data;
    assert.equal((await clientA(`/api/users/${me.id}`, 'PATCH', { clientId: companyB.id })).status, 403);
    assert.equal((await clientA('/api/auth/me')).data.clientId, companyA.id);
  });

  test('toda ruta nueva queda reservada al admin por defecto', async () => {
    assert.equal((await clientA('/api/ruta-que-no-existe')).status, 403);
  });
});

describe('costos y cobros', () => {
  test('el margen y el saldo se calculan con los importes cargados', async () => {
    const shipment = (await admin('/api/shipments', 'POST', newShipment(companyA.id))).data;
    await admin(`/api/shipments/${shipment.id}/costs`, 'POST', { category: 'Flete', amountUsd: 100.1 });
    const detail = (await admin(`/api/shipments/${shipment.id}/costs`, 'POST', { category: 'Seguro', amountUsd: 0.2 })).data;
    assert.equal(detail.costsUsd, 100.3);
  });

  test('un cobro no puede superar el saldo', async () => {
    const shipment = (await admin('/api/shipments', 'POST', newShipment(companyA.id))).data;
    assert.equal((await admin(`/api/shipments/${shipment.id}/payments`, 'POST', { amountUsd: 1000.01, paidAt: '2030-01-01' })).status, 400);
    assert.equal((await admin(`/api/shipments/${shipment.id}/payments`, 'POST', { amountUsd: 600, paidAt: '2030-01-01' })).status, 201);
    assert.equal((await admin(`/api/shipments/${shipment.id}/payments`, 'POST', { amountUsd: 400.01, paidAt: '2030-01-02' })).status, 400);
    assert.equal((await admin(`/api/shipments/${shipment.id}/payments`, 'POST', { amountUsd: 400, paidAt: '2030-01-02' })).data.paidUsd, 1000);
  });

  test('cobrar todo el saldo deja el embarque pagado', async () => {
    const shipment = (await admin('/api/shipments', 'POST', newShipment(companyA.id))).data;
    await admin(`/api/shipments/${shipment.id}/payments`, 'POST', { amountUsd: 250.5, paidAt: '2030-01-01' });
    const detail = (await admin(`/api/shipments/${shipment.id}/payments`, 'POST', { amountUsd: 749.5, paidAt: '2030-01-02' })).data;
    assert.equal(detail.paidUsd, 1000);

    const saved = (await admin('/api/shipments')).data.find(s => s.id === shipment.id);
    const finance = getFinance({ ...saved, paymentDueDate: '2020-01-01' });
    assert.equal(finance.balance, 0);
    assert.equal(finance.paymentStatus, 'Pagado');
    assert.equal(finance.isOverdue, false);

    const history = (await admin(`/api/shipments/${shipment.id}/notifications`)).data;
    assert.match(history[0].message, /^Pago completo: USD 749\.50$/);
    assert.equal((await admin(`/api/shipments/${shipment.id}/payments`, 'POST', { amountUsd: 0.01, paidAt: '2030-01-03' })).status, 400);
  });

  test('anular un cobro vuelve a dejar saldo', async () => {
    const shipment = (await admin('/api/shipments', 'POST', newShipment(companyA.id))).data;
    const paid = (await admin(`/api/shipments/${shipment.id}/payments`, 'POST', { amountUsd: 1000, paidAt: '2030-01-01' })).data;
    assert.equal(getFinance({ ...shipment, paidUsd: paid.paidUsd }).paymentStatus, 'Pagado');
    const after = (await admin(`/api/shipments/${shipment.id}/payments/${paid.payments[0].id}`, 'DELETE')).data;
    assert.equal(getFinance({ ...shipment, paidUsd: after.paidUsd }).paymentStatus, 'Pendiente');
  });

  test('rechaza importes y fechas inválidos', async () => {
    const route = `/api/shipments/${shipmentB.id}`;
    assert.equal((await admin(`${route}/costs`, 'POST', { category: 'x', amountUsd: -5 })).status, 400);
    assert.equal((await admin(`${route}/costs`, 'POST', { category: ' ', amountUsd: 5 })).status, 400);
    assert.equal((await admin(`${route}/payments`, 'POST', { amountUsd: 0, paidAt: '2030-01-01' })).status, 400);
    assert.equal((await admin(`${route}/payments`, 'POST', { amountUsd: 5, paidAt: 'ayer' })).status, 400);
  });

  test('no se puede borrar el costo de otro embarque', async () => {
    const detail = (await admin(`/api/shipments/${shipmentA.id}/finance`)).data;
    assert.equal((await admin(`/api/shipments/${shipmentB.id}/costs/${detail.costs[0].id}`, 'DELETE')).status, 404);
  });

  test('un cobro vencido genera un aviso una sola vez', async () => {
    const shipment = (await admin('/api/shipments', 'POST', { ...newShipment(companyB.id), paymentDueDate: '2020-01-01' })).data;
    await admin('/api/notifications');
    const { items } = (await admin('/api/notifications')).data;
    assert.equal(items.filter(n => n.type === 'payment-overdue' && n.shipmentId === shipment.id).length, 1);
  });

  test('borrar un embarque borra sus costos y cobros', async () => {
    const shipment = (await admin('/api/shipments', 'POST', newShipment(companyB.id))).data;
    await admin(`/api/shipments/${shipment.id}/costs`, 'POST', { category: 'x', amountUsd: 5 });
    assert.equal((await admin(`/api/shipments/${shipment.id}`, 'DELETE')).status, 200);
    assert.equal((await admin(`/api/shipments/${shipment.id}/finance`)).status, 404);
  });
});

describe('datos logísticos', () => {
  const data = { carrier: 'Naviera X', vessel: 'Buque Y', containerNumber: 'ABCD1234567', bookingNumber: 'BK1', actualDeparture: '2030-01-01', actualArrival: '2030-01-20' };

  test('el admin los guarda y el cliente dueño los ve en su historial', async () => {
    const saved = await admin(`/api/shipments/${shipmentA.id}/logistics`, 'PATCH', data);
    assert.equal(saved.status, 200);
    assert.equal(saved.data.containerNumber, 'ABCD1234567');
    const mine = (await clientA('/api/shipments')).data.find(s => s.id === shipmentA.id);
    assert.equal(mine.vessel, 'Buque Y');
    const history = (await clientA(`/api/shipments/${shipmentA.id}/notifications`)).data;
    assert.ok(history.some(n => n.type === 'logistics'));
    assert.ok(history.every(n => n.author === null));
  });

  test('un cliente no los puede modificar', async () => {
    assert.equal((await clientA(`/api/shipments/${shipmentA.id}/logistics`, 'PATCH', data)).status, 403);
  });

  test('rechaza fechas invertidas o inválidas', async () => {
    const route = `/api/shipments/${shipmentB.id}/logistics`;
    assert.equal((await admin(route, 'PATCH', { actualDeparture: '2030-02-01', actualArrival: '2030-01-01' })).status, 400);
    assert.equal((await admin(route, 'PATCH', { actualDeparture: 'ayer' })).status, 400);
    assert.equal((await admin('/api/shipments/999999/logistics', 'PATCH', {})).status, 404);
  });
});

describe('documentos', () => {
  const upload = async (session, shipmentId, name, body, { category = 'Factura', visible = '1' } = {}) => {
    const cookieSession = await session('/api/auth/me');
    assert.equal(cookieSession.status, 200);
    return session.raw(`/api/shipments/${shipmentId}/documents?${new URLSearchParams({ name, category, visibleToClient: visible })}`, body);
  };

  let visibleDoc;
  let internalDoc;

  before(async () => {
    visibleDoc = (await upload(admin, shipmentA.id, 'factura ñ.pdf', Buffer.from('%PDF-contenido-visible'))).data;
    internalDoc = (await upload(admin, shipmentA.id, 'interno.pdf', Buffer.from('%PDF-contenido-interno'), { visible: '0' })).data;
  });

  test('el admin sube y descarga un archivo intacto', async () => {
    const response = await fetchRaw(admin, `/api/documents/${visibleDoc.id}/download`);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), '%PDF-contenido-visible');
    assert.match(response.headers.get('content-disposition'), /^attachment; filename\*=UTF-8''factura%20%C3%B1\.pdf$/);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('content-type'), 'application/pdf');
  });

  test('el cliente dueño ve y descarga solo lo visible', async () => {
    const list = (await clientA(`/api/shipments/${shipmentA.id}/documents`)).data;
    assert.deepEqual(list.map(d => d.id), [visibleDoc.id]);
    assert.equal(list[0].uploadedBy, null);
    assert.equal((await fetchRaw(clientA, `/api/documents/${visibleDoc.id}/download`)).status, 200);
    assert.equal((await fetchRaw(clientA, `/api/documents/${internalDoc.id}/download`)).status, 404);
  });

  test('otro cliente no ve ni descarga documentos ajenos', async () => {
    assert.deepEqual((await clientB(`/api/shipments/${shipmentA.id}/documents`)).data, []);
    assert.equal((await fetchRaw(clientB, `/api/documents/${visibleDoc.id}/download`)).status, 404);
    assert.deepEqual((await pending(`/api/shipments/${shipmentA.id}/documents`)).data, []);
    assert.equal((await fetchRaw(pending, `/api/documents/${visibleDoc.id}/download`)).status, 404);
  });

  test('sin sesión no se accede', async () => {
    const anonymous = createSession();
    assert.equal((await fetchRaw(anonymous, `/api/documents/${visibleDoc.id}/download`)).status, 401);
  });

  test('un cliente no sube ni borra', async () => {
    assert.equal((await clientA.raw(`/api/shipments/${shipmentA.id}/documents?name=a.pdf&category=Factura`, Buffer.from('x'))).status, 403);
    assert.equal((await clientA(`/api/documents/${visibleDoc.id}`, 'DELETE')).status, 403);
  });

  test('rechaza formatos peligrosos, tipos inválidos y archivos vacíos', async () => {
    assert.equal((await upload(admin, shipmentB.id, 'virus.exe', Buffer.from('x'))).status, 400);
    assert.equal((await upload(admin, shipmentB.id, 'pagina.html', Buffer.from('<script>'))).status, 400);
    assert.equal((await upload(admin, shipmentB.id, 'a.pdf', Buffer.from('x'), { category: 'Inventado' })).status, 400);
    assert.equal((await upload(admin, shipmentB.id, 'a.pdf', Buffer.alloc(0))).status, 400);
    assert.equal((await upload(admin, 999999, 'a.pdf', Buffer.from('x'))).status, 404);
  });

  test('rechaza archivos de más de 4 MB', async () => {
    const response = await upload(admin, shipmentB.id, 'grande.pdf', Buffer.alloc(4 * 1024 * 1024 + 1));
    assert.equal(response.status, 413);
    assert.match(response.data.error, /4 MB/);
  });

  test('un nombre con ruta no sale de la carpeta de documentos', async () => {
    const response = await upload(admin, shipmentB.id, '../../../secreto.pdf', Buffer.from('x'));
    assert.equal(response.status, 201);
    assert.equal(response.data.fileName, 'secreto.pdf');
    const stored = fs.readdirSync(path.join(process.env.DOCUMENTS_DIR, 'documentos', String(shipmentB.id)));
    assert.ok(stored.every(name => /^[0-9a-f-]{36}\.pdf$/.test(name)));
  });

  test('borrar un documento y un embarque elimina los archivos', async () => {
    const shipment = (await admin('/api/shipments', 'POST', newShipment(companyB.id))).data;
    const doc = (await upload(admin, shipment.id, 'a.pdf', Buffer.from('x'))).data;
    const folder = path.join(process.env.DOCUMENTS_DIR, 'documentos', String(shipment.id));
    assert.equal(fs.readdirSync(folder).length, 1);
    assert.equal((await admin(`/api/documents/${doc.id}`, 'DELETE')).status, 200);
    assert.equal(fs.readdirSync(folder).length, 0);
    await upload(admin, shipment.id, 'b.pdf', Buffer.from('x'));
    await admin(`/api/shipments/${shipment.id}`, 'DELETE');
    assert.equal(fs.readdirSync(folder).length, 0);
  });
});

describe('cuentas de equipo', () => {
  let secondAdmin;

  before(async () => {
    const created = await admin('/api/users', 'POST', { username: 'admin-dos', password: 'clave-de-prueba-2', fullName: 'Segunda Persona' });
    assert.equal(created.status, 201);
    assert.equal(created.data.role, 'admin');
    secondAdmin = createSession();
    assert.equal((await secondAdmin('/api/auth/login', 'POST', { username: 'admin-dos', password: 'clave-de-prueba-2' })).status, 200);
  });

  test('un cliente no crea administradores', async () => {
    assert.equal((await clientA('/api/users', 'POST', { username: 'malo', password: 'clave-de-prueba-2', fullName: 'X' })).status, 403);
  });

  test('valida usuario y contraseña', async () => {
    assert.equal((await admin('/api/users', 'POST', { username: 'admin-dos', password: 'clave-de-prueba-2', fullName: 'X' })).status, 409);
    assert.equal((await admin('/api/users', 'POST', { username: 'corta', password: '123', fullName: 'X' })).status, 400);
    assert.equal((await admin('/api/users', 'POST', { username: 'con espacios', password: 'clave-de-prueba-2', fullName: 'X' })).status, 400);
  });

  test('cada cambio queda con su autor', async () => {
    const shipment = (await secondAdmin('/api/shipments', 'POST', newShipment(companyA.id))).data;
    await admin(`/api/shipments/${shipment.id}/followups`, 'POST', { note: 'nota' });
    const history = (await admin(`/api/shipments/${shipment.id}/notifications`)).data;
    assert.equal(history.find(n => n.type === 'created').author, 'Segunda Persona');
    assert.equal(history.find(n => n.type === 'followup').author, 'Administrador');
  });

  test('las notificaciones leídas son de cada usuario', async () => {
    const shipment = (await admin('/api/shipments', 'POST', newShipment(companyB.id))).data;
    const find = async (session) => (await session('/api/notifications')).data.items.find(n => n.shipmentId === shipment.id);
    const notification = await find(admin);
    assert.equal(notification.isRead, 0);

    const before = (await secondAdmin('/api/notifications')).data.unread;
    assert.equal((await admin(`/api/notifications/${notification.id}/read`, 'PATCH')).status, 200);
    assert.equal((await find(admin)).isRead, 1);
    assert.equal((await find(secondAdmin)).isRead, 0);
    assert.equal((await secondAdmin('/api/notifications')).data.unread, before);

    await secondAdmin('/api/notifications/read-all', 'POST', {});
    assert.equal((await secondAdmin('/api/notifications')).data.unread, 0);
    assert.equal((await admin('/api/notifications/999999/read', 'PATCH')).status, 404);
  });
});

describe('perfil', () => {
  let owner;
  let ownerId;
  let other;

  before(async () => {
    const created = await registerClient('perfil-cliente', 'Empresa A');
    owner = created.session;
    ownerId = created.id;
    await admin(`/api/users/${ownerId}`, 'PATCH', { clientId: companyA.id });
    other = (await admin('/api/users', 'POST', { username: 'admin-perfil', password: 'clave-de-prueba-3', fullName: 'Admin Perfil' })).data;
  });

  test('sin sesión no se accede', async () => {
    const anonymous = createSession();
    assert.equal((await anonymous('/api/auth/profile')).status, 401);
    assert.equal((await anonymous('/api/auth/profile', 'PATCH', { fullName: 'x' })).status, 401);
  });

  test('cada usuario edita sus datos', async () => {
    const response = await owner('/api/auth/profile', 'PATCH', { fullName: ' Nombre Nuevo ', username: 'perfil-nuevo', email: 'nuevo@example.com', country: 'Chile' });
    assert.equal(response.status, 200);
    assert.equal(response.data.fullName, 'Nombre Nuevo');
    assert.equal(response.data.username, 'perfil-nuevo');
    assert.equal(response.data.country, 'Chile');
    assert.doesNotMatch(response.text, /scrypt|password/i);
    assert.equal((await owner('/api/auth/me')).data.email, 'nuevo@example.com');
    assert.equal((await createSession()('/api/auth/login', 'POST', { username: 'perfil-nuevo', password: 'clave-de-prueba-1' })).status, 200);
  });

  test('no puede cambiarse rol, estado ni empresa', async () => {
    const response = await owner('/api/auth/profile', 'PATCH', {
      fullName: 'Nombre Nuevo', username: 'perfil-nuevo', email: 'nuevo@example.com', country: 'Chile',
      role: 'admin', status: 'active', clientId: companyB.id, client_id: companyB.id, id: 1
    });
    assert.equal(response.status, 200);
    assert.equal(response.data.role, 'client');
    assert.equal(response.data.clientId, companyA.id);
    assert.equal(response.data.id, ownerId);
  });

  test('valida los datos y no pisa a otro usuario', async () => {
    const base = { fullName: 'X', username: 'perfil-nuevo', email: 'a@example.com', country: 'AR' };
    assert.equal((await owner('/api/auth/profile', 'PATCH', { ...base, fullName: ' ' })).status, 400);
    assert.equal((await owner('/api/auth/profile', 'PATCH', { ...base, username: 'con espacios' })).status, 400);
    assert.equal((await owner('/api/auth/profile', 'PATCH', { ...base, email: 'sin-arroba' })).status, 400);
    assert.equal((await owner('/api/auth/profile', 'PATCH', { ...base, email: '' })).status, 400);
    assert.equal((await owner('/api/auth/profile', 'PATCH', { ...base, country: '' })).status, 400);
    assert.equal((await owner('/api/auth/profile', 'PATCH', { ...base, username: other.username })).status, 409);
  });

  test('el cliente ve solo movimientos permitidos de sus embarques', async () => {
    const summary = (await owner('/api/auth/profile')).data;
    assert.ok(summary.movements.length > 0);
    assert.ok(summary.movements.every(m => ['created', 'status', 'delivery', 'logistics'].includes(m.type)));
    const mine = (await owner('/api/shipments')).data.map(s => s.id);
    assert.ok(summary.movements.every(m => mine.includes(m.shipmentId)));
    assert.ok(!summary.movements.some(m => m.shipmentId === shipmentB.id));
    assert.equal(summary.stats.shipments, mine.length);
    assert.doesNotMatch(JSON.stringify(summary), /SEGUIMIENTO-INTERNO|Cobro|costsUsd|author/);
  });

  test('una cuenta pendiente no recibe movimientos', async () => {
    const summary = (await pending('/api/auth/profile')).data;
    assert.deepEqual(summary.movements, []);
    assert.equal(summary.stats.shipments, 0);
    assert.equal(summary.stats.totalUsd, 0);
  });

  test('el admin ve sus movimientos, y cambiarse el nombre no los pierde', async () => {
    const session = createSession();
    await session('/api/auth/login', 'POST', { username: 'admin-perfil', password: 'clave-de-prueba-3' });
    const shipment = (await session('/api/shipments', 'POST', newShipment(companyB.id))).data;
    await session(`/api/shipments/${shipment.id}/payments`, 'POST', { amountUsd: 10, paidAt: '2030-01-01' });
    await admin(`/api/shipments/${shipment.id}/followups`, 'POST', { note: 'de otra persona' });

    const before = (await session('/api/auth/profile')).data;
    assert.equal(before.stats.shipmentsCreated, 1);
    assert.equal(before.stats.paymentsRegistered, 1);
    assert.equal(before.stats.movements, 2);
    assert.equal(before.stats.recent, 2);
    assert.ok(!JSON.stringify(before.movements).includes('de otra persona'));

    assert.equal((await session('/api/auth/profile', 'PATCH', { fullName: 'Otro Nombre', username: 'admin-perfil', email: '' })).status, 200);
    assert.equal((await session('/api/auth/profile')).data.stats.movements, 2);
  });

  test('registra el último ingreso', async () => {
    const session = createSession();
    const login = await session('/api/auth/login', 'POST', { username: 'admin-perfil', password: 'clave-de-prueba-3' });
    assert.equal(login.status, 200);
    assert.ok(login.data.lastLoginAt);
  });
});

describe('foto de perfil', () => {
  const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), Buffer.from('contenido-png')]);
  const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPcontenido')]);
  let owner;
  let ownerId;
  let stranger;

  const put = async (session, body) => {
    const response = await fetch(`${baseUrl}/api/auth/avatar`, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png', cookie: session.cookie() },
      body
    });
    return { status: response.status, data: await response.json() };
  };

  const storedFiles = () => {
    const folder = path.join(process.env.DOCUMENTS_DIR, 'avatares', String(ownerId));
    return fs.existsSync(folder) ? fs.readdirSync(folder) : [];
  };

  before(async () => {
    const created = await registerClient('foto-cliente', 'Empresa A');
    owner = created.session;
    ownerId = created.id;
    stranger = (await registerClient('foto-extrano', 'Empresa B')).session;
  });

  test('sin sesión no se accede', async () => {
    const response = await fetch(`${baseUrl}/api/auth/avatar`, { method: 'PUT', body: PNG });
    assert.equal(response.status, 401);
    assert.equal((await fetch(`${baseUrl}/api/auth/avatar`)).status, 401);
    assert.equal((await fetch(`${baseUrl}/api/users/${ownerId}/avatar`)).status, 401);
  });

  test('el usuario sube su foto y la vuelve a ver intacta', async () => {
    const saved = await put(owner, PNG);
    assert.equal(saved.status, 200);
    assert.equal(saved.data.hasAvatar, 1);
    assert.ok(saved.data.avatarVersion);
    assert.doesNotMatch(JSON.stringify(saved.data), /avatares|avatar_key/);
    const response = await fetchRaw(owner, '/api/auth/avatar');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/png');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), PNG);
  });

  test('una foto nueva reemplaza a la anterior', async () => {
    assert.equal((await put(owner, WEBP)).status, 200);
    assert.equal(storedFiles().length, 1);
    assert.match(storedFiles()[0], /\.webp$/);
    assert.equal((await fetchRaw(owner, '/api/auth/avatar')).headers.get('content-type'), 'image/webp');
  });

  test('rechaza lo que no sea una imagen, aunque se declare como tal', async () => {
    for (const body of ['<svg onload="alert(1)"></svg>', '<script>alert(1)</script>', 'texto', '']) {
      assert.equal((await put(owner, Buffer.from(body))).status, 400);
    }
    assert.equal(storedFiles().length, 1);
  });

  test('rechaza fotos de más de 1 MB', async () => {
    const big = await put(owner, Buffer.concat([PNG, Buffer.alloc(1024 * 1024)]));
    assert.equal(big.status, 413);
    assert.match(big.data.error, /1 MB/);
  });

  test('otro cliente no ve fotos ajenas, un admin sí', async () => {
    assert.equal((await fetchRaw(stranger, `/api/users/${ownerId}/avatar`)).status, 403);
    assert.equal((await fetchRaw(stranger, '/api/auth/avatar')).status, 404);
    assert.equal((await fetchRaw(admin, `/api/users/${ownerId}/avatar`)).status, 200);
  });

  test('editar el perfil no toca la foto', async () => {
    const response = await owner('/api/auth/profile', 'PATCH', { fullName: 'Foto', username: 'foto-cliente', email: 'f@example.com', country: 'AR', avatar_key: '../../secreto', hasAvatar: 0 });
    assert.equal(response.data.hasAvatar, 1);
    assert.equal((await fetchRaw(owner, '/api/auth/avatar')).status, 200);
  });

  test('quitar la foto borra el archivo', async () => {
    const removed = await owner('/api/auth/avatar', 'DELETE');
    assert.equal(removed.status, 200);
    assert.equal(removed.data.hasAvatar, 0);
    assert.equal(storedFiles().length, 0);
    assert.equal((await fetchRaw(owner, '/api/auth/avatar')).status, 404);
  });
});

describe('códigos de embarque', () => {
  test('25 embarques simultáneos reciben códigos distintos', async () => {
    const responses = await Promise.all(
      Array.from({ length: 25 }, () => admin('/api/shipments', 'POST', newShipment(companyA.id, 'Pera')))
    );
    assert.ok(responses.every(r => r.status === 201));
    assert.equal(new Set(responses.map(r => r.data.code)).size, 25);
    assert.ok(responses.every(r => r.data.code.startsWith(`PE-${new Date().getFullYear()}-`)));
  });
});
