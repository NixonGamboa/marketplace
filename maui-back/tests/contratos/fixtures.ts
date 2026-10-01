import type { Order } from '../../src/domain/orders/Order.js'

export const NOW_ISO = '2026-09-03T10:00:00.000Z'

export const validPickupRequest = () => ({
  userId: 'cust_01',
  items: [{ id: 'prod_leche', name: 'Leche entera 1L', qty: 2, priceAtMoment: 4500 }],
  substitutionPreference: 'call_me',
  deliveryType: 'pickup',
  deliveryData: { timeSlot: 'morning' },
  customerName: 'Doña Carmen',
  customerPhone: '+57 300 123 4567',
  shippingCost: 0,
})

export const validDeliveryRequest = () => ({
  ...validPickupRequest(),
  deliveryType: 'delivery',
  deliveryData: { address: 'Calle 8 # 5-32, Dolores, Tolima', lat: 3.5402, lng: -74.8965 },
  shippingCost: 3000,
})

export const variableWeightItem = () => ({
  id: 'prod_carne',
  name: 'Carne molida',
  qty: 1,
  priceAtMoment: 22000,
  is_variable_weight: true,
  kilosRequested: 1.5,
})

export const internalOrder = (overrides: Partial<Order> = {}): Order => ({
  id: '01HJ0000000000000000000001',
  storeId: 'leche-y-miel',
  customerId: 'cust_01',
  customerName: 'Doña Carmen',
  customerPhone: '573001234567',
  items: [
    { id: 'prod_leche', name: 'Leche entera 1L', qty: 2, priceAtMoment: 4500 },
    { ...variableWeightItem() },
  ],
  status: 'received',
  deliveryType: 'delivery',
  deliveryData: { address: 'Calle 8 # 5-32', lat: 3.5402, lng: -74.8965, timeSlot: 'asap' },
  substitutionPreference: 'similar',
  shippingCost: 3000,
  estimatedTotal: 45000,
  createdAt: NOW_ISO,
  updatedAt: NOW_ISO,
  ...overrides,
})
