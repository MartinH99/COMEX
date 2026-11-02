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

const { default: app } = await import('../server/app.js');
const { default: db } = await import('../server/db.js');

let server;
let baseUrl;

function createSession() {
  let cookie = '';
  return async (route, method = 'GET', body) => {
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
}

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

async function registerClient(username, company) {
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
