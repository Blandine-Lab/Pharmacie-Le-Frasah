import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import WebSocket from 'ws';
import { pathToFileURL } from 'node:url';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Route de test
app.get('/api/test', (req, res) => {
  res.json({ message: 'Backend OK' });
});

console.log('🔍 Démarrage du backend...');
console.log('🔑 VITE_SUPABASE_URL:', process.env.VITE_SUPABASE_URL ? 'défini' : 'NON DÉFINI');
console.log('🔑 SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'défini' : 'NON DÉFINI');
console.log('🔑 JWT_SECRET:', process.env.JWT_SECRET ? 'défini' : 'NON DÉFINI');

// Client Supabase
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    realtime: {
      transport: WebSocket,
    },
  }
);

const JWT_SECRET = process.env.JWT_SECRET || 'your_secret_key_here';

// =============================================
// ROUTE 1 : Statistiques du tableau de bord
// =============================================
app.get('/api/dashboard/stats', async (req, res) => {
  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const startISO = startOfDay.toISOString();
    const endISO = endOfDay.toISOString();

    const { data: todaySales, error: salesError } = await supabase
      .from('sales')
      .select('total_amount, payment_method, client_id')
      .gte('sale_date', startISO)
      .lt('sale_date', endISO);

    if (salesError) throw salesError;

    const caJour = todaySales.reduce((sum, s) => sum + (s.total_amount || 0), 0);
    const nbVentesJour = todaySales.length;

    const paymentStats = {};
    todaySales.forEach(s => {
      const key = s.payment_method || 'cash';
      paymentStats[key] = (paymentStats[key] || 0) + (s.total_amount || 0);
    });

    const { data: allProducts, error: productError } = await supabase
      .from('products')
      .select('id, name, current_stock, reorder_level, prix_achat, unit_price, date_peremption');

    if (productError) throw productError;

    const totalStockValue = allProducts.reduce(
      (sum, p) => sum + (p.current_stock || 0) * (p.prix_achat || 0),
      0
    );
    const totalStockSellValue = allProducts.reduce(
      (sum, p) => sum + (p.current_stock || 0) * (p.unit_price || 0),
      0
    );
    const totalStockQuantity = allProducts.reduce((sum, p) => sum + (p.current_stock || 0), 0);
    const nbMedicaments = allProducts.length;
    const nbMedicamentsEnStock = allProducts.filter(p => (p.current_stock || 0) > 0).length;

    const stockAlerts = allProducts.filter(p => (p.current_stock || 0) <= (p.reorder_level || 0));

    const now2 = new Date();
    const peremptionAlerts = allProducts
      .filter(p => p.date_peremption)
      .map(p => {
        const exp = new Date(p.date_peremption);
        const diffDays = Math.floor((exp - now2) / (24 * 3600 * 1000));
        return { ...p, diffDays };
      })
      .filter(p => p.diffDays <= 30)
      .sort((a, b) => a.diffDays - b.diffDays);

    res.json({
      success: true,
      data: {
        caJour,
        nbVentesJour,
        paymentStats,
        totalStockValue,
        totalStockSellValue,
        margePotentielle: totalStockSellValue - totalStockValue,
        totalStockQuantity,
        nbMedicaments,
        nbMedicamentsEnStock,
        stockAlerts,
        peremptionAlerts,
        products: allProducts,
        date: startOfDay.toISOString().split('T')[0],
      },
    });
  } catch (error) {
    console.error('Erreur dashboard:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================
// ROUTE 2 : Enregistrer un mouvement de stock
// =============================================
app.post('/api/movement', async (req, res) => {
  try {
    const { product_id, quantity, movement_type, cooperant_id, reference_id, reason } = req.body;

    if (!product_id || !quantity || !movement_type) {
      return res.status(400).json({ success: false, error: 'Champs requis manquants' });
    }

    const { data: product, error: productError } = await supabase
      .from('products')
      .select('current_stock')
      .eq('id', product_id)
      .single();

    if (productError) throw productError;

    let newStock = product.current_stock;
    let quantityChange;

    if (
      movement_type === 'cooperant_take' ||
      movement_type === 'retail_sale' ||
      movement_type === 'stock_loss'
    ) {
      if (product.current_stock < quantity) {
        return res.status(400).json({ success: false, error: 'Stock insuffisant' });
      }
      newStock = product.current_stock - quantity;
      quantityChange = -quantity;
    } else if (movement_type === 'cooperant_return' || movement_type === 'supplier_in') {
      newStock = product.current_stock + quantity;
      quantityChange = quantity;
    } else {
      return res.status(400).json({ success: false, error: 'Type de mouvement invalide' });
    }

    const { error: updateError } = await supabase
      .from('products')
      .update({ current_stock: newStock })
      .eq('id', product_id);

    if (updateError) throw updateError;

    let tourNumber = null;
    if (movement_type === 'cooperant_take') {
      const { data: lastTake, error: takeError } = await supabase
        .from('stock_movements')
        .select('tour_number')
        .eq('cooperant_id', cooperant_id)
        .eq('product_id', product_id)
        .eq('movement_type', 'cooperant_take')
        .order('tour_number', { ascending: false })
        .limit(1);

      if (takeError) throw takeError;
      const lastTour = lastTake && lastTake.length > 0 ? lastTake[0].tour_number : 0;
      tourNumber = lastTour + 1;
    } else if (movement_type === 'cooperant_return') {
      const { data: lastTake, error: takeError } = await supabase
        .from('stock_movements')
        .select('tour_number')
        .eq('cooperant_id', cooperant_id)
        .eq('product_id', product_id)
        .eq('movement_type', 'cooperant_take')
        .order('created_at', { ascending: false })
        .limit(1);

      if (takeError) throw takeError;
      tourNumber = lastTake && lastTake.length > 0 ? lastTake[0].tour_number : 0;
    }

    const { data: movement, error: moveError } = await supabase
      .from('stock_movements')
      .insert({
        product_id,
        quantity_change: quantityChange,
        movement_type,
        cooperant_id: cooperant_id || null,
        reference_id: reference_id || null,
        reason: reason || '',
        tour_number: tourNumber,
      })
      .select()
      .single();

    if (moveError) throw moveError;

    res.json({ success: true, data: movement });
  } catch (error) {
    console.error('Erreur mouvement:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================
// ROUTE 2b : Récupérer un produit par ID
// =============================================
app.get('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    res.json({ success: true, data });
  } catch (error) {
    console.error('Erreur récupération produit:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================
// ROUTE 2c : Mettre à jour un mouvement
// =============================================
app.put('/api/movement/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity_change } = req.body;

    if (quantity_change === undefined) {
      return res.status(400).json({ success: false, error: 'La quantité change est requise' });
    }

    const { data, error } = await supabase
      .from('stock_movements')
      .update({ quantity_change })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, data });
  } catch (error) {
    console.error('Erreur mise à jour mouvement:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================
// ROUTE 2d : Mettre à jour le stock d'un produit
// =============================================
app.put('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { current_stock } = req.body;

    if (current_stock === undefined) {
      return res.status(400).json({ success: false, error: 'current_stock est requis' });
    }

    const { data, error } = await supabase
      .from('products')
      .update({ current_stock })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, data });
  } catch (error) {
    console.error('Erreur mise à jour produit:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================
// ROUTE 3 : Récupérer les mouvements avec filtres
// =============================================
app.get('/api/movements', async (req, res) => {
  try {
    const { cooperant_id, start_date, end_date, movement_type } = req.query;

    let query = supabase
      .from('stock_movements')
      .select('*')
      .order('created_at', { ascending: false });

    if (cooperant_id) query = query.eq('cooperant_id', cooperant_id);
    if (movement_type) query = query.eq('movement_type', movement_type);
    if (start_date) query = query.gte('created_at', `${start_date}T00:00:00`);
    if (end_date) query = query.lte('created_at', `${end_date}T23:59:59`);

    const { data: movements, error } = await query;
    if (error) throw error;

    const productIds = [...new Set(movements.map(m => m.product_id).filter(Boolean))];
    const cooperantIds = [...new Set(movements.map(m => m.cooperant_id).filter(Boolean))];

    const [productsRes, sellersRes] = await Promise.all([
      productIds.length ? supabase.from('products').select('id, name, unit_price, dci, dosage').in('id', productIds) : { data: [] },
      cooperantIds.length ? supabase.from('sellers').select('id, name').in('id', cooperantIds) : { data: [] },
    ]);

    const productMap = Object.fromEntries((productsRes.data || []).map(p => [p.id, p]));
    const sellerMap = Object.fromEntries((sellersRes.data || []).map(s => [s.id, s]));

    const result = movements.map(m => ({
      ...m,
      product: productMap[m.product_id] || null,
      cooperant: sellerMap[m.cooperant_id] || null,
    }));

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Erreur récupération mouvements:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================
// ROUTE 4 : Suivi journalier des stocks
// =============================================
app.get('/api/stock/daily', async (req, res) => {
  try {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    const startISO = start.toISOString();
    const endISO = end.toISOString();

    const { data: products, error: productError } = await supabase
      .from('products')
      .select('id, name, current_stock, reorder_level, dci, dosage, forme');

    if (productError) throw productError;

    const { data: movements, error: moveError } = await supabase
      .from('stock_movements')
      .select('product_id, quantity_change, movement_type, created_at')
      .gte('created_at', startISO)
      .lt('created_at', endISO);

    if (moveError) throw moveError;

    const productStats = {};
    products.forEach(p => {
      productStats[p.id] = {
        id: p.id,
        name: p.name,
        dci: p.dci,
        dosage: p.dosage,
        forme: p.forme,
        current_stock: p.current_stock,
        reorder_level: p.reorder_level,
        entries: 0,
        exits: 0,
      };
    });

    movements.forEach(m => {
      const pid = m.product_id;
      if (!productStats[pid]) return;
      const qty = Math.abs(m.quantity_change);
      const type = m.movement_type;

      if (type === 'supplier_in' || type === 'cooperant_return') {
        productStats[pid].entries += qty;
      } else if (type === 'cooperant_take' || type === 'retail_sale' || type === 'stock_loss') {
        productStats[pid].exits += qty;
      }
    });

    const result = Object.values(productStats).map(p => {
      const initialStock = p.current_stock - p.entries + p.exits;
      return {
        ...p,
        initialStock: Math.max(initialStock, 0),
        finalStock: p.current_stock,
      };
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Erreur suivi journalier:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================
// ROUTE 5 : Enregistrer une vente
// =============================================
app.post('/api/sale', async (req, res) => {
  try {
    const { client_id, total_amount, payment_method, note, operator_id, sale_type } = req.body;

    if (!total_amount) {
      return res.status(400).json({ success: false, error: 'Montant total requis' });
    }

    const saleData = {
      client_id: client_id || null,
      operator_id: operator_id || null,
      total_amount: parseFloat(total_amount),
      payment_method: payment_method || 'cash',
      note: note || null,
      sale_type: sale_type || 'medicament',
      sale_date: new Date().toISOString(),
    };

    const { data: sale, error } = await supabase
      .from('sales')
      .insert(saleData)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, data: sale });
  } catch (error) {
    console.error('Erreur enregistrement vente:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================
// ROUTE 6 : Récupérer les ventes avec filtres
// =============================================
app.get('/api/sales', async (req, res) => {
  try {
    const { start_date, end_date, client_id } = req.query;

    let query = supabase
      .from('sales')
      .select('*')
      .order('sale_date', { ascending: false });

    if (client_id) query = query.eq('client_id', client_id);
    if (start_date) query = query.gte('sale_date', `${start_date}T00:00:00`);
    if (end_date) query = query.lte('sale_date', `${end_date}T23:59:59`);

    const { data, error } = await query;
    if (error) throw error;
    res.json({ success: true, data });
  } catch (error) {
    console.error('Erreur récupération ventes:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================
// ROUTE 7 : Récupérer les transactions de caisse
// =============================================
app.get('/api/cash/transactions', async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    let query = supabase
      .from('cash_transactions')
      .select('*')
      .order('transaction_date', { ascending: true });

    if (start_date) query = query.gte('transaction_date', `${start_date}T00:00:00`);
    if (end_date) query = query.lte('transaction_date', `${end_date}T23:59:59`);

    const { data, error } = await query;
    if (error) throw error;
    res.json({ success: true, data });
  } catch (error) {
    console.error('Erreur récupération transactions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================
// ROUTE 8 : Ajouter une transaction de caisse
// =============================================
app.post('/api/cash/transaction', async (req, res) => {
  try {
    const { type, category, description, amount, payment_method, transaction_date } = req.body;
    if (!type || !category || !amount) {
      return res.status(400).json({ success: false, error: 'Champs requis manquants' });
    }
    const { data, error } = await supabase
      .from('cash_transactions')
      .insert({
        type,
        category,
        description: description || '',
        amount: parseFloat(amount),
        payment_method: payment_method || 'cash',
        transaction_date: transaction_date || new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (error) {
    console.error('Erreur ajout transaction:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================
// ROUTE 9 : Récupérer tous les utilisateurs
// =============================================
app.get('/api/users', async (req, res) => {
  try {
    // ✅ MODIFICATION : Ajout de permissions et last_login
    const { data, error } = await supabase
      .from('users')
      .select('id, email, full_name, role, active, permissions, last_login, created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ success: true, data });
  } catch (error) {
    console.error('Erreur récupération utilisateurs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================
// ROUTE 10 : Ajouter un utilisateur
// =============================================
app.post('/api/users', async (req, res) => {
  try {
    // ✅ MODIFICATION : Ajout de permissions
    const { email, password, full_name, role, permissions } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email et mot de passe requis' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const { data, error } = await supabase
      .from('users')
      .insert({ 
        email, 
        password: hashedPassword, 
        full_name, 
        role: role || 'user',
        permissions: permissions || [] // ✅ Ajout de permissions
      })
      .select()
      .single();
    if (error) throw error;

    delete data.password;
    res.json({ success: true, data });
  } catch (error) {
    console.error('Erreur ajout utilisateur:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================
// ROUTE 11 : Modifier un utilisateur
// =============================================
app.put('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    // ✅ MODIFICATION : Ajout de permissions
    const { email, full_name, role, active, password, permissions } = req.body;
    
    const updateData = { 
      email, 
      full_name, 
      role, 
      active, 
      permissions: permissions || [], // ✅ Ajout de permissions
      updated_at: new Date().toISOString() 
    };
    
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }
    const { data, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    delete data.password;
    res.json({ success: true, data });
  } catch (error) {
    console.error('Erreur mise à jour utilisateur:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================
// ROUTE 12 : Supprimer un utilisateur
// =============================================
app.delete('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('users').delete().eq('id', id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error('Erreur suppression utilisateur:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================
// ROUTE 13 : Récupérer les paramètres
// =============================================
app.get('/api/settings', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('*')
      .order('key', { ascending: true });
    if (error) throw error;
    res.json({ success: true, data });
  } catch (error) {
    console.error('Erreur récupération paramètres:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================
// ROUTE 14 : Mettre à jour un paramètre
// =============================================
app.put('/api/settings/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    if (value === undefined) {
      return res.status(400).json({ success: false, error: 'Valeur requise' });
    }
    const { data, error } = await supabase
      .from('settings')
      .update({ value, updated_at: new Date().toISOString() })
      .eq('key', key)
      .select()
      .single();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (error) {
    console.error('Erreur mise à jour paramètre:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================
// ROUTE 15 : Connexion (login)
// =============================================
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email et mot de passe requis' });
    }

    // ✅ MODIFICATION : On sélectionne aussi permissions
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, full_name, role, active, password, permissions')
      .eq('email', email)
      .single();

    if (error || !user) {
      return res.status(401).json({ success: false, error: 'Identifiants incorrects' });
    }

    if (!user.active) {
      return res.status(401).json({ success: false, error: 'Compte désactivé' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ success: false, error: 'Identifiants incorrects' });
    }

    // ✅ MODIFICATION : Enregistrer l'heure de connexion
    await supabase
      .from('users')
      .update({ last_login: new Date().toISOString() })
      .eq('id', user.id);

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    delete user.password;

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        permissions: user.permissions || [], // ✅ MODIFICATION : Renvoyer les permissions
      },
    });
  } catch (error) {
    console.error('Erreur login:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================
// ROUTE 16 : Vérification du token (me)
// =============================================
app.get('/api/auth/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ success: false, error: 'Token manquant' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    // ✅ MODIFICATION : On sélectionne aussi permissions
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, full_name, role, active, permissions')
      .eq('id', decoded.id)
      .single();

    if (error || !user) {
      return res.status(401).json({ success: false, error: 'Utilisateur introuvable' });
    }

    res.json({ success: true, user });
  } catch (error) {
    console.error('Erreur vérification token:', error);
    res.status(401).json({ success: false, error: 'Token invalide' });
  }
});

// =============================================
// ✅ EXPORT POUR SERVERLESS (Vercel / Netlify)
// =============================================
export default app;

// =============================================
// DÉMARRAGE DU SERVEUR (Windows / Linux / macOS / Render)
// =============================================
const isServerless = !!process.env.NETLIFY || !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule || !isServerless) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`🚀 Backend démarré sur http://localhost:${PORT}`);
  });
}