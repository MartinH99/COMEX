import { CALIBERS_MASTER } from '../data/mockData.js';

const COLOR_BRAND = [30, 51, 37];
const COLOR_SOFT = [107, 104, 98];
const COLOR_LINE = [231, 228, 218];
const COLOR_TINT = [238, 245, 217];
const KG_PER_BOX = 10;
const BOXES_PER_PALLET = 104;
const MARGIN = 16;

const money = (value) => `USD ${(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const number = (value) => (value || 0).toLocaleString('en-US');

function dateLabel(value) {
  if (!value) return 'A confirmar';
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

// Arma el documento; recibe las librerías para poder cargarlas recién al usarlas
export function renderProspectPdf(prospect, { jsPDF, autoTable }, issuedAt = new Date()) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - MARGIN * 2;
  const number4 = String(prospect.id).padStart(4, '0');

  // Encabezado
  doc.setFillColor(...COLOR_BRAND);
  doc.rect(0, 0, pageWidth, 32, 'F');
  doc.setTextColor(244, 247, 236);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('COMEX', MARGIN, 15);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Gestión de exportaciones', MARGIN, 22);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('Presupuesto', pageWidth - MARGIN, 14, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`N.° P-${number4}`, pageWidth - MARGIN, 20, { align: 'right' });
  doc.text(`Emitido: ${issuedAt.toLocaleDateString('es-AR')}`, pageWidth - MARGIN, 25, { align: 'right' });

  // Cliente
  let y = 43;
  doc.setTextColor(...COLOR_SOFT);
  doc.setFontSize(8);
  doc.text('PREPARADO PARA', MARGIN, y);
  y += 6;
  doc.setTextColor(31, 29, 27);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  const companyLines = doc.splitTextToSize(prospect.company, contentWidth);
  doc.text(companyLines, MARGIN, y);
  y += companyLines.length * 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const contactLine = [prospect.contact, prospect.country, prospect.email].filter(Boolean).join('  |  ');
  const contactLines = doc.splitTextToSize(contactLine, contentWidth);
  doc.text(contactLines, MARGIN, y);
  y += contactLines.length * 5 + 5;

  // Condiciones
  const conditions = [
    ['Producto', prospect.product, 'Condición', `${prospect.condition} - ${prospect.deal}`],
    ['Transporte', prospect.transport, 'Puerto de destino', prospect.port || 'A confirmar'],
    ['Semana de salida', prospect.loadWeek ? `Semana ${prospect.loadWeek}` : 'A confirmar', 'Entrega estimada', dateLabel(prospect.deliveryDate)],
    ['Condición de pago', prospect.paymentTerms || 'A confirmar', 'Tolerancia de carga', `±${prospect.variance}%`]
  ];

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    body: conditions,
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 2.2, textColor: [31, 29, 27] },
    columnStyles: {
      0: { textColor: COLOR_SOFT, cellWidth: 34 },
      2: { textColor: COLOR_SOFT, cellWidth: 34 }
    }
  });

  // Calibres
  const rows = Object.entries(prospect.calibres || {})
    .filter(([, item]) => item.boxes > 0)
    .map(([code, item]) => {
      const master = CALIBERS_MASTER.find(c => c.code === code);
      return [
        code,
        master?.label || '',
        number(item.boxes),
        money(item.priceKg),
        money(item.boxes * KG_PER_BOX * item.priceKg)
      ];
    });

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 6,
    margin: { left: MARGIN, right: MARGIN, bottom: 22 },
    head: [['Calibre', 'Denominación', 'Cajas (10 kg)', 'Precio por kg', 'Subtotal']],
    body: rows,
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2.5, lineColor: COLOR_LINE, lineWidth: 0.2, textColor: [31, 29, 27] },
    headStyles: { fillColor: COLOR_BRAND, textColor: [244, 247, 236], fontStyle: 'bold' },
    columnStyles: {
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' }
    },
    // Encabezados numéricos alineados con sus valores
    didParseCell: ({ section, column, cell }) => {
      if (section === 'head' && column.index >= 2) cell.styles.halign = 'right';
    }
  });

  // Totales: si no entran en la página, pasan a la siguiente
  const pallets = (prospect.boxes / BOXES_PER_PALLET).toFixed(1);
  const tons = ((prospect.boxes * KG_PER_BOX) / 1000).toFixed(2);
  const totalHeight = 18;
  y = doc.lastAutoTable.finalY + 6;
  if (y + totalHeight > pageHeight - 22) {
    doc.addPage();
    y = MARGIN;
  }
  doc.setFillColor(...COLOR_TINT);
  doc.rect(MARGIN, y, contentWidth, totalHeight, 'F');
  doc.setTextColor(70, 98, 15);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`${number(prospect.boxes)} cajas  |  ${pallets} pallets  |  ${tons} toneladas`, MARGIN + 4, y + 11);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(money(prospect.totalUsd), pageWidth - MARGIN - 4, y + 11, { align: 'right' });

  // Pie en todas las páginas
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setDrawColor(...COLOR_LINE);
    doc.line(MARGIN, pageHeight - 18, pageWidth - MARGIN, pageHeight - 18);
    doc.setTextColor(...COLOR_SOFT);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`Propuesta válida hasta: ${dateLabel(prospect.validUntil)}. Valores expresados en dólares estadounidenses.`, MARGIN, pageHeight - 13);
    doc.text(`Página ${page} de ${pages}`, pageWidth - MARGIN, pageHeight - 13, { align: 'right' });
  }

  return doc;
}

export const prospectPdfName = (prospect) => {
  const company = prospect.company.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `Presupuesto-P-${String(prospect.id).padStart(4, '0')}-${company || 'cliente'}.pdf`;
};

export async function downloadProspectPdf(prospect) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  renderProspectPdf(prospect, { jsPDF, autoTable }).save(prospectPdfName(prospect));
}
