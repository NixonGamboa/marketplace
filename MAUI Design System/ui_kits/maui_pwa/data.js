// MAUI Mock Data — catálogo, pasillos, pedido ejemplo
// -----------------------------------------------------
// ASCII product placeholders → emoji permitted aquí (solo data, no UI copy)

window.MAUI_PASILLOS = [
  { id: 'frutas',    name: 'Frutas y Verduras', count: 48, icon: '🥑', bg: '#E8F5E9' },
  { id: 'lacteos',   name: 'Lácteos y Huevos',  count: 24, icon: '🥛', bg: '#FDF3E0' },
  { id: 'carnes',    name: 'Carnes y Pescados', count: 18, icon: '🥩', bg: '#FCEBE3' },
  { id: 'granos',    name: 'Granos y Pastas',   count: 36, icon: '🌾', bg: '#FDE8C6' },
  { id: 'aseo',      name: 'Aseo del Hogar',    count: 52, icon: '🧼', bg: '#E3F0FA' },
  { id: 'bebidas',   name: 'Bebidas',           count: 30, icon: '🧃', bg: '#F1E5FA' },
];

window.MAUI_FRUTAS = [
  { id: 'agu', name: 'Aguacate Hass',        unit: 'unidad',    price: 3500, variable: false, img: 'agu' },
  { id: 'ban', name: 'Banano Maduro',        unit: 'libra (~500g)', price: 2800, variable: true, img: 'ban' },
  { id: 'toma', name: 'Tomate Chonto',       unit: 'libra (~500g)', price: 3200, variable: true, img: 'toma' },
  { id: 'cebo', name: 'Cebolla Cabezona',    unit: 'libra (~500g)', price: 2500, variable: true, img: 'cebo' },
  { id: 'papa', name: 'Papa Pastusa',        unit: 'libra (~500g)', price: 1900, variable: true, img: 'papa' },
  { id: 'zana', name: 'Zanahoria',           unit: 'libra (~500g)', price: 2100, variable: true, img: 'zana' },
  { id: 'lima', name: 'Limón Tahití',        unit: 'unidad',    price: 800,  variable: false, img: 'lima', stock: 0 },
  { id: 'lech', name: 'Lechuga Batavia',     unit: 'unidad',    price: 2700, variable: false, img: 'lech' },
];

window.MAUI_FAV = [
  { id: 'arrz', name: 'Arroz Diana 500g',     unit: 'paquete', price: 3200, variable: false, img: 'arrz' },
  { id: 'leche', name: 'Leche Alquería 1L',   unit: 'litro',   price: 4600, variable: false, img: 'leche' },
  { id: 'pan',   name: 'Pan tajado Bimbo',    unit: 'paquete', price: 7900, variable: false, img: 'pan' },
  { id: 'huevo', name: 'Huevo AA x30',        unit: 'cubeta',  price: 18500, variable: false, img: 'huevo' },
];

window.MAUI_LAST_ORDER = {
  ref: 'MAU-2041',
  date: '15 abr',
  items: 12,
  total: 78400,
};

window.MAUI_CURRENT_ORDER = {
  ref: 'MAU-2068',
  state: 2, // 0 recibido, 1 preparando, 2 listo, 3 en-camino, 4 entregado
  photo: true,
  items: [
    { name: 'Arroz Diana 500g',  qty: 2, unit: 'paquete', est: 3200, real: 3200, variable: false },
    { name: 'Banano Maduro',     qty: 2, unit: 'libra',   est: 2800, real: 2650, variable: true },
    { name: 'Tomate Chonto',     qty: 1, unit: 'libra',   est: 3200, real: 3480, variable: true },
    { name: 'Leche Alquería',    qty: 3, unit: 'litro',   est: 4600, real: 4600, variable: false },
    { name: 'Pan tajado Bimbo',  qty: 1, unit: 'paquete', est: 7900, real: 7900, variable: false },
  ],
  eta: '40–55 min',
};
