import Dexie from 'dexie';

export const db = new Dexie('GloriaBusinessDB');

db.version(1).stores({
  products: 'id, name, current_stock, unit_price, size, bottles_per_pack, reorder_level',
  sellers: 'id, name, email, phone',
  operators: 'id, name, stock_megas, stock_unites, stock_fc, stock_usd',
  clients: 'id, name, phone, credit_balance',
  sales: 'id, sale_date, total_amount, payment_method, operator_id, client_id, sale_type',
  stock_movements: 'id, product_id, quantity_change, movement_type, cooperant_id, created_at',
  cash_transactions: 'id, transaction_date, type, category, amount, payment_method',
  settings: 'key, value',
  users: 'id, email, full_name, role, active'   // ✅ Ajout de la table users
});

// Fonction pour vider toutes les tables
export const clearAll = async () => {
  await db.products.clear();
  await db.sellers.clear();
  await db.operators.clear();
  await db.clients.clear();
  await db.sales.clear();
  await db.stock_movements.clear();
  await db.cash_transactions.clear();
  await db.settings.clear();
  await db.users.clear();   // ✅ Ajout
};

// Fonction pour remplir toutes les tables depuis Supabase
export const populateDatabase = async (data) => {
  const { products, sellers, operators, clients, sales, stock_movements, cash_transactions, settings, users } = data;
  if (products) await db.products.bulkPut(products);
  if (sellers) await db.sellers.bulkPut(sellers);
  if (operators) await db.operators.bulkPut(operators);
  if (clients) await db.clients.bulkPut(clients);
  if (sales) await db.sales.bulkPut(sales);
  if (stock_movements) await db.stock_movements.bulkPut(stock_movements);
  if (cash_transactions) await db.cash_transactions.bulkPut(cash_transactions);
  if (settings) await db.settings.bulkPut(settings);
  if (users) await db.users.bulkPut(users);
};