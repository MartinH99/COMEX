export const CALIBERS_MASTER = [
    { code: 'C20', fruitsBox: 20, avgWeightGrams: 500, label: 'Super Jumbo', defaultPriceKg: 2.80 },
    { code: 'C23', fruitsBox: 23, avgWeightGrams: 435, label: 'Extra Jumbo', defaultPriceKg: 2.65 },
    { code: 'C25', fruitsBox: 25, avgWeightGrams: 400, label: 'Jumbo', defaultPriceKg: 2.50 },
    { code: 'C27', fruitsBox: 27, avgWeightGrams: 370, label: 'Grande Premium', defaultPriceKg: 2.40 },
    { code: 'C30', fruitsBox: 30, avgWeightGrams: 333, label: 'Grande', defaultPriceKg: 2.25 },
    { code: 'C33', fruitsBox: 33, avgWeightGrams: 303, label: 'Mediano Superior', defaultPriceKg: 2.10 },
    { code: 'C36', fruitsBox: 36, avgWeightGrams: 278, label: 'Mediano Standard', defaultPriceKg: 1.95 },
    { code: 'C39', fruitsBox: 39, avgWeightGrams: 256, label: 'Mediano', defaultPriceKg: 1.80 },
    { code: 'C42', fruitsBox: 42, avgWeightGrams: 238, label: 'Chico Superior', defaultPriceKg: 1.65 },
    { code: 'C45', fruitsBox: 45, avgWeightGrams: 222, label: 'Chico Standard', defaultPriceKg: 1.50 },
    { code: 'C49', fruitsBox: 49, avgWeightGrams: 204, label: 'Económico A', defaultPriceKg: 1.35 },
    { code: 'C54', fruitsBox: 54, avgWeightGrams: 185, label: 'Económico B', defaultPriceKg: 1.20 }
  ];
  
  export const INITIAL_CLIENTS = [
    { id: 1, company: 'Rotterdam Fruit Imports B.V.', country: 'Holanda', contact: 'Jan van der Meer', rating: 5, defaultPayment: '50/50; 15 días llegada fruta' },
    { id: 2, company: 'Shanghai Fresh Trading Co.', country: 'China', contact: 'Wei Zhang', rating: 5, defaultPayment: '100% CAD (Cash Against Documents)' },
    { id: 3, company: 'Philadephia Produce Corp', country: 'EE.UU.', contact: 'Michael Scott', rating: 4, defaultPayment: '30 días desde arribo a puerto' },
    { id: 4, company: 'Mercado Central Santos S.A.', country: 'Brasil', contact: 'Carlos Silva', rating: 3, defaultPayment: '50% anticipado, 50% entrega' }
  ];
  
  export const INITIAL_SHIPMENTS = [
    {
      id: 101,
      code: 'KW-2025-W18-01',
      clientId: 1,
      condition: 'Venta',
      deal: 'Precio Cerrado',
      product: 'Kiwi Hayward Green',
      fruitType: 'Convencional',
      category: 'Cat 1',
      currency: 'USD',
      loadWeek: 18,
      etaWeek: 'Semana 20 (ETA Mayo 15)',
      transport: 'Marítimo',
      port: 'Puerto de Rotterdam',
      paymentTerms: '50/50; 15 días llegada fruta',
      variance: 2.0,
      boxes: 2288,
      calibres: {
        'C27': { boxes: 500, priceKg: 2.40 },
        'C30': { boxes: 800, priceKg: 2.25 },
        'C33': { boxes: 600, priceKg: 2.10 },
        'C36': { boxes: 388, priceKg: 1.95 }
      },
      totalUsd: 49446.00,
      status: 'En Tránsito'
    }
  ];