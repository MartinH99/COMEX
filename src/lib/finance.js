const cents = (value) => Math.round(value * 100) / 100;

export const COST_CATEGORIES = ['Costo de fruta', 'Empaque', 'Flete', 'Seguro', 'Aduana', 'Comisión', 'Otros'];

export const today = () => new Date().toLocaleDateString('en-CA');

// Margen y saldo de un embarque; costsUsd y paidUsd solo llegan a usuarios admin
export function getFinance(shipment, referenceDate = today()) {
  const total = shipment.totalUsd || 0;
  const costs = shipment.costsUsd || 0;
  const paid = shipment.paidUsd || 0;
  const margin = cents(total - costs);
  const balance = cents(total - paid);
  const isOverdue = balance > 0 && Boolean(shipment.paymentDueDate) && shipment.paymentDueDate < referenceDate;

  let paymentStatus = 'Pendiente';
  if (balance <= 0) paymentStatus = 'Pagado';
  else if (isOverdue) paymentStatus = 'Vencido';
  else if (paid > 0) paymentStatus = 'Parcial';

  return {
    total,
    costs,
    paid,
    margin,
    marginPercent: total > 0 ? (margin / total) * 100 : 0,
    balance,
    isOverdue,
    paymentStatus
  };
}

export const PAYMENT_BADGE = {
  'Pendiente': 'pend',
  'Parcial': 'brand',
  'Vencido': 'alert',
  'Pagado': 'ok'
};

// Suma un valor por grupo y devuelve los grupos de mayor a menor
export function sumBy(items, getKey, getValue) {
  const totals = new Map();
  items.forEach(item => {
    const key = getKey(item);
    totals.set(key, (totals.get(key) || 0) + getValue(item));
  });
  return [...totals.entries()]
    .map(([label, value]) => ({ label, value: cents(value) }))
    .sort((a, b) => b.value - a.value);
}
