import { supabase } from './supabaseClient';
import { db, clearAll, populateDatabase } from './db';

export const syncAllData = async () => {
  console.log('🔄 Synchronisation avec Supabase...');
  try {
    const [
      productsRes,
      sellersRes,
      operatorsRes,
      clientsRes,
      salesRes,
      movementsRes,
      cashRes,
      settingsRes,
      usersRes   // ✅ Ajout de la table users
    ] = await Promise.all([
      supabase.from('products').select('*'),
      supabase.from('sellers').select('*'),
      supabase.from('operators').select('*'),
      supabase.from('clients').select('*'),
      supabase.from('sales').select('*'),
      supabase.from('stock_movements').select('*'),
      supabase.from('cash_transactions').select('*'),
      supabase.from('settings').select('*'),
      supabase.from('users').select('*')   // ✅ Requête vers la table users
    ]);

    const data = {
      products: productsRes.data || [],
      sellers: sellersRes.data || [],
      operators: operatorsRes.data || [],
      clients: clientsRes.data || [],
      sales: salesRes.data || [],
      stock_movements: movementsRes.data || [],
      cash_transactions: cashRes.data || [],
      settings: settingsRes.data || [],
      users: usersRes.data || []   // ✅ Ajout dans l'objet data
    };

    await clearAll();
    await populateDatabase(data);
    console.log('✅ Synchronisation terminée');
    return true;
  } catch (error) {
    console.error('❌ Erreur synchronisation:', error);
    return false;
  }
};