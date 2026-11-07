import Dexie from 'dexie';

export const db = new Dexie('GloriaBusinessDB');

// Version 3 : toutes les tables finales avec sync_queue adaptée
db.version(3).stores({
  products: 'id, name, current_stock, unit_price, size, bottles_per_pack, reorder_level',
  sellers: 'id, name, email, phone',
  clients: 'id, name, phone, credit_balance',
  operators: 'id, name, stock_megas, stock_unites, stock_fc, stock_usd',
  stock_movements: 'id, product_id, quantity_change, movement_type, cooperant_id, created_at',
  sales: 'id, total_amount, payment_method, sale_date, client_id, operator_id, sale_type',
  users: 'id, email, full_name, role, active',
  settings: 'key, value',
  cash_transactions: 'id, type, category, amount, payment_method, transaction_date',
  sync_queue: '++id, synced'  // ✅ ajout de l'index synced pour la file d'attente
}).upgrade(tx => {
  // Migration : initialiser les paramètres par défaut (si la table settings existe)
  const settingsTable = tx.table('settings');
  settingsTable.bulkPut([
    { key: 'company_name', value: 'Gloria Business' },
    { key: 'currency', value: 'FC' },
    { key: 'currency_symbol', value: 'FC' },
    { key: 'contact_email', value: 'contact@gloria.com' },
    { key: 'contact_phone', value: '+243 800 000 000' },
    { key: 'address', value: 'Kinshasa, RDC' },
    { key: 'default_vat', value: '0' },
    { key: 'default_reorder_level', value: '10' },
    { key: 'default_unit_price', value: '500' },
    { key: 'logo_url', value: '/logo.jpeg' },
  ]);
});

// Fonction pour vider toutes les tables (utilisée lors de la synchronisation)
export const clearAll = async () => {
  await db.products.clear();
  await db.sellers.clear();
  await db.clients.clear();
  await db.operators.clear();
  await db.stock_movements.clear();
  await db.sales.clear();
  await db.users.clear();
  await db.settings.clear();
  await db.cash_transactions.clear();
  // Ne pas vider sync_queue car elle contient les opérations en attente
};

// Fonction pour remplir toutes les tables depuis les données Supabase
export const populateDatabase = async (data) => {
  const {
    products,
    sellers,
    clients,
    operators,
    stock_movements,
    sales,
    users,
    settings,
    cash_transactions
  } = data;

  if (products) await db.products.bulkPut(products);
  if (sellers) await db.sellers.bulkPut(sellers);
  if (clients) await db.clients.bulkPut(clients);
  if (operators) await db.operators.bulkPut(operators);
  if (stock_movements) await db.stock_movements.bulkPut(stock_movements);
  if (sales) await db.sales.bulkPut(sales);
  if (users) await db.users.bulkPut(users);
  if (settings) await db.settings.bulkPut(settings);
  if (cash_transactions) await db.cash_transactions.bulkPut(cash_transactions);
};

export default db;