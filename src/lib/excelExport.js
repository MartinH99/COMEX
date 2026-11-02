const header = (titles) => titles.map(value => ({ value, fontWeight: 'bold', backgroundColor: '#EEF5D9' }));
const text = (value) => ({ type: String, value: value ?? '' });
const int = (value) => (value === null || value === undefined ? null : { type: Number, value, format: '#,##0' });
const usd = (value) => ({ type: Number, value: value || 0, format: '#,##0.00' });

// Se guarda como fecha real para que Excel pueda ordenarla y filtrarla
const date = (value) => (value ? { type: Date, value: new Date(`${value}T00:00:00Z`), format: 'dd/mm/yyyy' } : null);

export function buildShipmentSheets(shipments, clients) {
  const clientOf = (shipment) => clients.find(c => c.id === shipment.clientId);

  const main = [
    header(['Código', 'Cliente', 'País', 'Producto', 'Condición', 'Modalidad', 'Semana de salida', 'Entrega estimada', 'Puerto', 'Transporte', 'Estado', 'Cajas', 'Cajas entregadas', 'Diferencia de cajas', 'Tolerancia %', 'Total USD', 'Condición de pago']),
    ...shipments.map(s => {
      const client = clientOf(s);
      const delivered = s.deliveredBoxes ?? null;
      return [
        text(s.code), text(client?.company), text(client?.country), text(s.product), text(s.condition), text(s.deal),
        int(s.loadWeek), date(s.deliveryDate), text(s.port), text(s.transport), text(s.status),
        int(s.boxes), int(delivered), int(delivered === null ? null : delivered - s.boxes),
        { type: Number, value: s.variance ?? 0 }, usd(s.totalUsd), text(s.paymentTerms)
      ];
    })
  ];

  const calibers = [
    header(['Código', 'Cliente', 'Calibre', 'Cajas', 'USD / kg', 'Subtotal USD']),
    ...shipments.flatMap(s => Object.entries(s.calibres || {})
      .filter(([, item]) => item.boxes > 0)
      .map(([code, item]) => [
        text(s.code), text(clientOf(s)?.company), text(code), int(item.boxes), usd(item.priceKg), usd(item.boxes * 10 * item.priceKg)
      ]))
  ];

  return [
    { data: main, sheet: 'Embarques', stickyRowsCount: 1, columns: [18, 28, 14, 20, 12, 18, 10, 12, 18, 12, 13, 9, 11, 11, 10, 13, 30].map(width => ({ width })) },
    { data: calibers, sheet: 'Calibres', stickyRowsCount: 1, columns: [18, 28, 9, 9, 10, 13].map(width => ({ width })) }
  ];
}

export function buildProspectSheets(prospects, { includeNotes }) {
  const titles = ['N.°', 'Empresa', 'País', 'Contacto', 'Email', 'Producto', 'Condición', 'Modalidad', 'Puerto', 'Semana de salida', 'Entrega estimada', 'Validez', 'Estado', 'Cajas', 'Presupuesto USD', 'Condición de pago', 'Embarque'];
  if (includeNotes) titles.push('Notas');

  const rows = prospects.map(p => {
    const row = [
      text(`P-${String(p.id).padStart(4, '0')}`), text(p.company), text(p.country), text(p.contact), text(p.email),
      text(p.product), text(p.condition), text(p.deal), text(p.port), int(p.loadWeek),
      date(p.deliveryDate), date(p.validUntil), text(p.status), int(p.boxes), usd(p.totalUsd), text(p.paymentTerms), text(p.shipmentCode)
    ];
    if (includeNotes) row.push(text(p.notes));
    return row;
  });

  const widths = [9, 28, 14, 20, 24, 16, 12, 18, 18, 10, 12, 12, 15, 9, 14, 30, 18];
  if (includeNotes) widths.push(40);

  return [{ data: [header(titles), ...rows], sheet: 'Prospectos', stickyRowsCount: 1, columns: widths.map(width => ({ width })) }];
}

// La librería se carga recién al exportar, para no sumar peso a la carga inicial
export async function downloadExcel(sheets, baseName) {
  const { default: writeExcelFile } = await import('write-excel-file/browser');
  const stamp = new Date().toLocaleDateString('en-CA');
  await writeExcelFile(sheets).toFile(`${baseName}-${stamp}.xlsx`);
}
