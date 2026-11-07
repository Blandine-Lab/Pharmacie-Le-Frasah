import { supabase } from '../utils/supabaseClient';
import db from '../db';

// Mapping des tables locales (camelCase) -> noms Supabase (snake_case)
const TABLE_MAP = {
  products: 'products',
  sellers: 'sellers',
  clients: 'clients',
  operators: 'operators',
  stockMovements: 'stock_movements',   // local camelCase → Supabase snake_case
  sales: 'sales',
  cashTransactions: 'cash_transactions',
  settings: 'settings',
  users: 'users'
};

// Synchroniser les données depuis Supabase vers IndexedDB (remplacement complet)
export const syncFromServer = async () => {
  console.log('🔄 Synchronisation avec Supabase...');
  try {
    const tables = Object.keys(TABLE_MAP);
    const results = await Promise.all(
      tables.map(async (localTable) => {
        const supabaseTable = TABLE_MAP[localTable];
        const { data, error } = await supabase
          .from(supabaseTable)
          .select('*');
        if (error) throw error;
        return { localTable, data: data || [] };
      })
    );

    // Vider toutes les tables locales
    await db.products.clear();
    await db.sellers.clear();
    await db.clients.clear();
    await db.operators.clear();
    await db.stockMovements.clear();   // camelCase
    await db.sales.clear();
    await db.cashTransactions.clear(); // camelCase
    await db.settings.clear();
    await db.users.clear();

    // Insérer les nouvelles données
    for (const { localTable, data } of results) {
      if (data.length > 0) {
        await db[localTable].bulkPut(data); // localTable est camelCase
      }
      console.log(`✅ Table ${localTable} synchronisée (${data.length} lignes)`);
    }

    console.log('✅ Synchronisation terminée');
    return { success: true };
  } catch (error) {
    console.error('❌ Erreur synchronisation:', error);
    return { success: false, error };
  }
};

// Ajouter une opération à la file d'attente (pour les écritures hors ligne)
export const addToSyncQueue = async (action, localTable, data) => {
  try {
    // Vérifier que la table syncQueue existe
    if (!db.tables.some(t => t.name === 'syncQueue')) {
      db.version(db.verno + 1).stores({ syncQueue: '++id, synced' });
      await db.open();
    }
    await db.syncQueue.add({
      action,
      table: localTable, // stocké en camelCase
      data,
      timestamp: new Date().toISOString(),
      synced: false, // ✅ Toujours défini à false à la création
    });
    return { success: true };
  } catch (error) {
    console.error('❌ Erreur ajout à la file d\'attente:', error);
    return { success: false, error };
  }
};

// Traiter la file d'attente (quand la connexion revient)
export const processSyncQueue = async () => {
  try {
    if (!db.tables.some(t => t.name === 'syncQueue')) {
      console.log('📭 Aucune file d\'attente trouvée.');
      return { success: true, count: 0 };
    }

    // ✅ SÉCURITÉ : On entoure la lecture de la file d'attente d'un try/catch
    let pendingItems = [];
    try {
      pendingItems = await db.syncQueue.where('synced').equals(false).toArray();
    } catch (dbError) {
      console.warn("⚠️ La file d'attente est corrompue (index invalide). Nettoyage complet de la file d'attente...", dbError);
      await db.syncQueue.clear(); // On vide la file pour éviter de bloquer l'app
      return { success: true, count: 0 };
    }

    if (pendingItems.length === 0) return { success: true, count: 0 };

    console.log(`🔄 Traitement de ${pendingItems.length} éléments en attente...`);

    let successCount = 0;
    for (const item of pendingItems) {
      try {
        const supabaseTable = TABLE_MAP[item.table];
        if (!supabaseTable) {
          console.warn(`Table ${item.table} non reconnue, ignorée.`);
          // On la marque comme synchro pour ne pas bloquer
          await db.syncQueue.update(item.id, { synced: true });
          continue;
        }

        let response;
        switch (item.action) {
          case 'insert':
            response = await supabase
              .from(supabaseTable)
              .insert(item.data);
            break;
          case 'update':
            response = await supabase
              .from(supabaseTable)
              .update(item.data)
              .eq('id', item.data.id);
            break;
          case 'delete':
            response = await supabase
              .from(supabaseTable)
              .delete()
              .eq('id', item.data.id);
            break;
          default:
            continue;
        }
        if (response.error) throw response.error;

        await db.syncQueue.update(item.id, { synced: true });
        successCount++;
        console.log(`✅ Item ${item.id} synchronisé (${item.action} sur ${item.table})`);
      } catch (error) {
        console.error(`❌ Erreur synchronisation de l'item ${item.id}:`, error);
      }
    }

    // Nettoyer les éléments traités avec succès
    await db.syncQueue.where('synced').equals(true).delete();

    return { success: true, count: successCount };
  } catch (error) {
    console.error('❌ Erreur traitement file d\'attente:', error);
    // En cas d'erreur globale, vider la file pour ne pas bloquer l'app au démarrage
    try {
      await db.syncQueue.clear();
    } catch(e) {}
    return { success: false, error };
  }
};

// Vérifier la connexion et synchroniser (appelée au démarrage)
export const checkAndSync = async () => {
  const isOnline = navigator.onLine;
  if (isOnline) {
    await syncFromServer();
    await processSyncQueue();
    return true;
  } else {
    console.log('📴 Hors ligne, les données restent locales.');
    return false;
  }
};

export const syncAll = checkAndSync;