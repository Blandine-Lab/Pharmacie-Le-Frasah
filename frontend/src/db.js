import Dexie from 'dexie';

const db = new Dexie('GloriaBusinessDB');

// Version 4 : tables en camelCase pour correspondre au code
db.version(4).stores({
  products: 'id, name, current_stock, unit_price, size, bottles_per_pack, reorder_level',
  sellers: 'id, name, email, phone',
  clients: 'id, name, phone, credit_balance',
  operators: 'id, name, stock_megas, stock_unites, stock_fc, stock_usd',
  stockMovements: 'id, product_id, cooperant_id, movement_type, created_at, quantity_change',
  sales: 'id, client_id, operator_id, sale_date, total_amount, sale_type, payment_method',
  users: 'id, email, full_name, role, active',
  settings: 'key, value',
  cashTransactions: 'id, type, category, amount, payment_method, transaction_date',
  syncQueue: '++id, synced'
}).upgrade(tx => {
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

export const clearAll = async () => {
  await db.products.clear();
  await db.sellers.clear();
  await db.clients.clear();
  await db.operators.clear();
  await db.stockMovements.clear();
  await db.sales.clear();
  await db.users.clear();
  await db.settings.clear();
  await db.cashTransactions.clear();
};

export const populateDatabase = async (data) => {
  const {
    products,
    sellers,
    clients,
    operators,
    stock_movements, // Supabase renvoie en snake_case
    sales,
    users,
    settings,
    cash_transactions
  } = data;

  if (products) await db.products.bulkPut(products);
  if (sellers) await db.sellers.bulkPut(sellers);
  if (clients) await db.clients.bulkPut(clients);
  if (operators) await db.operators.bulkPut(operators);
  if (stock_movements) await db.stockMovements.bulkPut(stock_movements);
  if (sales) await db.sales.bulkPut(sales);
  if (users) await db.users.bulkPut(users);
  if (settings) await db.settings.bulkPut(settings);
  if (cash_transactions) await db.cashTransactions.bulkPut(cash_transactions);
};

export default db;