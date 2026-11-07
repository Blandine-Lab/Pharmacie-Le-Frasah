import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../utils/supabaseClient';
import api from '../services/api';
import db from '../db';
import { syncAll } from '../services/syncService';

// Couleurs pharmacie
const PRIMARY = '#065f46';
const ACCENT = '#10b981';
const WARN = '#f59e0b';
const DANGER = '#dc2626'; // ✅ AJOUT DE LA COULEUR MANQUANTE ICI

// Modules pharmacie (permissions)
const MODULES = [
  { key: 'dashboard', label: 'Tableau de bord' },
  { key: 'stocks', label: 'Stocks médicaments' },
  { key: 'entrees', label: 'Entrées médicaments' },
  { key: 'sorties', label: 'Ventes' },
  { key: 'rapports', label: 'Rapports' },
  { key: 'clients', label: 'Patients' },
  { key: 'vendeurs', label: 'Pharmaciens & employés' },
  { key: 'caisse', label: 'Caisse' },
  { key: 'parametres', label: 'Paramètres' },
  { key: 'sauvegarde', label: 'Sauvegarde' },
];

// Formes galéniques pharmacie
const FORMES = [
  'Comprimé', 'Gélule', 'Sirop', 'Suspension', 'Injectable',
  'Pommade', 'Crème', 'Gouttes', 'Suppositoire', 'Sachet', 'Autre'
];

const Admin = () => {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');

  // Fournisseurs (anciennement coopérants)
  const [sellers, setSellers] = useState([]);
  const [newSeller, setNewSeller] = useState({
    name: '', email: '', phone: '', adresse: '', contact_person: ''
  });

  // Médicaments (anciennement produits)
  const [products, setProducts] = useState([]);
  const [newProduct, setNewProduct] = useState({
    name: '', dci: '', dosage: '', forme: 'Comprimé', laboratoire: '',
    prix_achat: '', unit_price: '', current_stock: '',
    reorder_level: 10, date_peremption: '', lot: '', description: ''
  });

  // États pour la modification d'un médicament
  const [showEditProductModal, setShowEditProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [editProductForm, setEditProductForm] = useState({});

  // Patients (anciennement clients)
  const [clients, setClients] = useState([]);
  const [newClient, setNewClient] = useState({
    name: '', phone: '', address: '', credit_balance: '', mutuelle: '', date_naissance: ''
  });

  // Utilisateurs
  const [users, setUsers] = useState([]);
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [userForm, setUserForm] = useState({
    email: '', password: '', full_name: '', role: 'user', active: true, permissions: [],
  });

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  // ⚠️ Mot de passe admin
  const ADMIN_PASSWORD = 'pharmacie2026';

  // =============================================
  // CONNEXION ADMIN
  // =============================================
  const handleLogin = (e) => {
    e.preventDefault();
    if (password === ADMIN_PASSWORD) {
      setIsAuthenticated(true);
      fetchAllData();
    } else {
      alert('Mot de passe incorrect');
    }
  };

  // =============================================
  // CHARGEMENT DES DONNÉES
  // =============================================
  const fetchAllData = async () => {
    await Promise.all([
      fetchSellers(), fetchProducts(), fetchClients(), fetchUsers(),
    ]);
  };

  const fetchSellers = async () => {
    try {
      const data = await db.sellers.toArray();
      setSellers(data || []);
    } catch (error) {
      console.error('Erreur chargement fournisseurs:', error);
    }
  };

  const fetchProducts = async () => {
    try {
      const data = await db.products.toArray();
      setProducts(data || []);
    } catch (error) {
      console.error('Erreur chargement médicaments:', error);
    }
  };

  const fetchClients = async () => {
    try {
      const data = await db.clients.toArray();
      setClients(data || []);
    } catch (error) {
      console.error('Erreur chargement patients:', error);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await api.get('/users');
      if (response.data.success) setUsers(response.data.data);
    } catch (error) {
      console.error('Erreur chargement utilisateurs:', error);
    }
  };

  // =============================================
  // GESTION DES FOURNISSEURS
  // =============================================
  const addSeller = async (e) => {
    e.preventDefault();
    if (!newSeller.name) {
      setMessage({ text: 'Le nom est requis', type: 'error' });
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.from('sellers').insert([newSeller]).select();
      if (error) throw error;
      setSellers([...sellers, data[0]]);
      setNewSeller({ name: '', email: '', phone: '', adresse: '', contact_person: '' });
      setMessage({ text: '✅ Fournisseur ajouté', type: 'success' });
      await syncAll();
      await fetchSellers();
    } catch (error) {
      setMessage({ text: '❌ Erreur: ' + error.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const deleteSeller = async (id) => {
    if (!confirm('Supprimer ce fournisseur ?')) return;
    try {
      const { error } = await supabase.from('sellers').delete().eq('id', id);
      if (error) throw error;
      setSellers(sellers.filter(s => s.id !== id));
      setMessage({ text: '✅ Fournisseur supprimé', type: 'success' });
      await syncAll();
      await fetchSellers();
    } catch (error) {
      setMessage({ text: '❌ Erreur: ' + error.message, type: 'error' });
    }
  };

  // =============================================
  // GESTION DES MÉDICAMENTS
  // =============================================
  const handleProductChange = (e) => {
    const { name, value } = e.target;
    setNewProduct(prev => ({ ...prev, [name]: value }));
  };

  const addProduct = async (e) => {
    e.preventDefault();
    if (!newProduct.name || !newProduct.unit_price) {
      setMessage({ text: 'Le nom et le prix de vente sont requis', type: 'error' });
      return;
    }
    setLoading(true);
    try {
      const productData = {
        name: newProduct.name,
        dci: newProduct.dci || null,
        dosage: newProduct.dosage || null,
        forme: newProduct.forme || null,
        laboratoire: newProduct.laboratoire || null,
        prix_achat: parseFloat(newProduct.prix_achat) || 0,
        unit_price: parseFloat(newProduct.unit_price),
        current_stock: parseInt(newProduct.current_stock) || 0,
        reorder_level: parseInt(newProduct.reorder_level) || 10,
        date_peremption: newProduct.date_peremption || null,
        lot: newProduct.lot || null,
        description: newProduct.description || null,
      };
      const { data, error } = await supabase.from('products').insert([productData]).select();
      if (error) throw error;
      setProducts([...products, data[0]]);
      setNewProduct({
        name: '', dci: '', dosage: '', forme: 'Comprimé', laboratoire: '',
        prix_achat: '', unit_price: '', current_stock: '',
        reorder_level: 10, date_peremption: '', lot: '', description: ''
      });
      setMessage({ text: '✅ Médicament ajouté', type: 'success' });
      await syncAll();
      await fetchProducts();
    } catch (error) {
      setMessage({ text: '❌ Erreur: ' + error.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // ✅ Ouvrir le modal de modification
  const openEditProductModal = (product) => {
    setEditingProduct(product);
    setEditProductForm({
      name: product.name || '',
      dci: product.dci || '',
      dosage: product.dosage || '',
      forme: product.forme || 'Comprimé',
      laboratoire: product.laboratoire || '',
      prix_achat: product.prix_achat?.toString() || '',
      unit_price: product.unit_price?.toString() || '',
      current_stock: product.current_stock?.toString() || '',
      reorder_level: product.reorder_level?.toString() || '10',
      date_peremption: product.date_peremption || '',
      lot: product.lot || '',
      description: product.description || ''
    });
    setShowEditProductModal(true);
  };

  const closeEditProductModal = () => {
    setShowEditProductModal(false);
    setEditingProduct(null);
  };

  const handleEditProductChange = (e) => {
    const { name, value } = e.target;
    setEditProductForm(prev => ({ ...prev, [name]: value }));
  };

  // ✅ Enregistrer les modifications
  const updateProduct = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const productData = {
        name: editProductForm.name,
        dci: editProductForm.dci || null,
        dosage: editProductForm.dosage || null,
        forme: editProductForm.forme || null,
        laboratoire: editProductForm.laboratoire || null,
        prix_achat: parseFloat(editProductForm.prix_achat) || 0,
        unit_price: parseFloat(editProductForm.unit_price),
        current_stock: parseInt(editProductForm.current_stock) || 0,
        reorder_level: parseInt(editProductForm.reorder_level) || 10,
        date_peremption: editProductForm.date_peremption || null,
        lot: editProductForm.lot || null,
        description: editProductForm.description || null,
      };
      
      const { error } = await supabase
        .from('products')
        .update(productData)
        .eq('id', editingProduct.id);

      if (error) throw error;
      
      closeEditProductModal();
      setMessage({ text: '✅ Médicament mis à jour avec succès', type: 'success' });
      await syncAll();
      await fetchProducts();
    } catch (error) {
      setMessage({ text: '❌ Erreur: ' + error.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const deleteProduct = async (id) => {
    if (!confirm('Supprimer ce médicament ?')) return;
    try {
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) throw error;
      setProducts(products.filter(p => p.id !== id));
      setMessage({ text: '✅ Médicament supprimé', type: 'success' });
      await syncAll();
      await fetchProducts();
    } catch (error) {
      setMessage({ text: '❌ Erreur: ' + error.message, type: 'error' });
    }
  };

  // =============================================
  // GESTION DES PATIENTS
  // =============================================
  const addClient = async (e) => {
    e.preventDefault();
    if (!newClient.name || !newClient.phone) {
      setMessage({ text: 'Le nom et le téléphone sont requis', type: 'error' });
      return;
    }
    setLoading(true);
    try {
      const clientData = {
        name: newClient.name,
        phone: newClient.phone,
        address: newClient.address || null,
        credit_balance: parseFloat(newClient.credit_balance) || 0,
        mutuelle: newClient.mutuelle || null,
        date_naissance: newClient.date_naissance || null,
      };
      const { data, error } = await supabase.from('clients').insert([clientData]).select();
      if (error) throw error;
      setClients([...clients, data[0]]);
      setNewClient({ name: '', phone: '', address: '', credit_balance: '', mutuelle: '', date_naissance: '' });
      setMessage({ text: '✅ Patient ajouté', type: 'success' });
      await syncAll();
      await fetchClients();
    } catch (error) {
      setMessage({ text: '❌ Erreur: ' + error.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const deleteClient = async (id) => {
    if (!confirm('Supprimer ce patient ?')) return;
    try {
      const { error } = await supabase.from('clients').delete().eq('id', id);
      if (error) throw error;
      setClients(clients.filter(c => c.id !== id));
      setMessage({ text: '✅ Patient supprimé', type: 'success' });
      await syncAll();
      await fetchClients();
    } catch (error) {
      setMessage({ text: '❌ Erreur: ' + error.message, type: 'error' });
    }
  };

  // =============================================
  // GESTION DES UTILISATEURS
  // =============================================
  const openUserModal = (user = null) => {
    if (user) {
      setEditingUser(user);
      setUserForm({
        email: user.email, password: '', full_name: user.full_name || '',
        role: user.role, active: user.active, permissions: user.permissions || [],
      });
    } else {
      setEditingUser(null);
      setUserForm({ email: '', password: '', full_name: '', role: 'user', active: true, permissions: [] });
    }
    setShowUserModal(true);
  };

  const closeUserModal = () => {
    setShowUserModal(false);
    setEditingUser(null);
  };

  const handleUserFormChange = (e) => {
    const { name, value, type, checked } = e.target;
    setUserForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handlePermissionToggle = (moduleKey) => {
    setUserForm(prev => ({
      ...prev,
      permissions: prev.permissions.includes(moduleKey)
        ? prev.permissions.filter(p => p !== moduleKey)
        : [...prev.permissions, moduleKey]
    }));
  };

  const handleUserSubmit = async (e) => {
    e.preventDefault();
    if (!userForm.email || (!editingUser && !userForm.password)) {
      setMessage({ text: 'Email et mot de passe requis', type: 'error' });
      return;
    }
    setLoading(true);
    try {
      const response = editingUser
        ? await api.put(`/users/${editingUser.id}`, userForm)
        : await api.post('/users', userForm);
      if (response.data.success) {
        closeUserModal();
        await fetchUsers();
        setMessage({ text: `✅ Utilisateur ${editingUser ? 'modifié' : 'créé'}`, type: 'success' });
      } else {
        setMessage({ text: response.data.error || 'Erreur', type: 'error' });
      }
    } catch (error) {
      setMessage({ text: '❌ Erreur serveur', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const deleteUser = async (id) => {
    if (!confirm('Supprimer cet utilisateur définitivement ?')) return;
    try {
      await api.delete(`/users/${id}`);
      await fetchUsers();
      setMessage({ text: '✅ Utilisateur supprimé', type: 'success' });
    } catch (error) {
      setMessage({ text: '❌ Erreur suppression', type: 'error' });
    }
  };

  // =============================================
  // ÉCRAN DE CONNEXION ADMIN
  // =============================================
  if (!isAuthenticated) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
        <form onSubmit={handleLogin} style={{ background: 'white', padding: '2.5rem', borderRadius: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', minWidth: '350px' }}>
          <h2 style={{ textAlign: 'center', color: PRIMARY }}>🔐 Accès administrateur</h2>
          <p style={{ textAlign: 'center', color: '#6b7280', marginBottom: '1.5rem' }}>Pharmacie Le Frasah</p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mot de passe administrateur"
            required
            style={{ width: '100%', padding: '0.75rem', marginBottom: '1rem', borderRadius: '0.5rem', border: '1px solid #d1d5db', fontSize: '1rem' }}
          />
          <button type="submit" style={{ width: '100%', padding: '0.75rem', background: PRIMARY, color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '1rem' }}>
            Connexion
          </button>
        </form>
      </div>
    );
  }

  // =============================================
  // PANNEAU D'ADMINISTRATION
  // =============================================
  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
      <h1 style={{ marginBottom: '0.5rem', color: PRIMARY }}>⚙️ Administration — Pharmacie Le Frasah</h1>
      <p style={{ color: '#6b7280', marginBottom: '2rem' }}>Gestion des fournisseurs, médicaments, patients et utilisateurs</p>

      {message.text && (
        <div style={{
          padding: '0.75rem', borderRadius: '0.5rem', marginBottom: '1rem',
          background: message.type === 'success' ? '#d1fae5' : '#fecaca',
          color: message.type === 'success' ? '#065f46' : '#991b1b'
        }}>
          {message.text}
        </div>
      )}

      {/* SECTION : Gestion des utilisateurs */}
      <div style={{ background: 'white', padding: '1.5rem', borderRadius: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0 }}>👥 Gestion des utilisateurs</h3>
          <button onClick={() => openUserModal()} style={{ background: ACCENT, color: 'white', padding: '0.3rem 1rem', border: 'none', borderRadius: '0.3rem', cursor: 'pointer' }}>
            ➕ Nouvel utilisateur
          </button>
        </div>
        {users.length === 0 ? <p>Aucun utilisateur enregistré.</p> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
                  <th style={{ padding: '0.5rem' }}>Email</th>
                  <th style={{ padding: '0.5rem' }}>Nom</th>
                  <th style={{ padding: '0.5rem' }}>Rôle</th>
                  <th style={{ padding: '0.5rem' }}>Actif</th>
                  <th style={{ padding: '0.5rem', textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '0.5rem' }}>{u.email}</td>
                    <td style={{ padding: '0.5rem' }}>{u.full_name || '-'}</td>
                    <td style={{ padding: '0.5rem' }}>{u.role}</td>
                    <td style={{ padding: '0.5rem' }}>{u.active ? '✅' : '❌'}</td>
                    <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                      <button onClick={() => openUserModal(u)} style={{ background: '#f59e0b', color: 'white', border: 'none', padding: '0.2rem 0.7rem', borderRadius: '0.25rem', cursor: 'pointer', marginRight: '0.5rem' }}>✏️ Modifier</button>
                      <button onClick={() => deleteUser(u.id)} style={{ background: '#ef4444', color: 'white', border: 'none', padding: '0.2rem 0.7rem', borderRadius: '0.25rem', cursor: 'pointer' }}>🗑️ Supprimer</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Modal utilisateur */}
        {showUserModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000 }}>
            <div style={{ background: 'white', padding: '2rem', borderRadius: '1rem', maxWidth: '600px', width: '100%', maxHeight: '90vh', overflow: 'auto' }}>
              <h2 style={{ marginTop: 0, color: '#1f2937' }}>{editingUser ? '✏️ Modifier' : '➕ Nouvel utilisateur'}</h2>
              <form onSubmit={handleUserSubmit}>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.2rem' }}>Email *</label>
                  <input type="email" name="email" value={userForm.email} onChange={handleUserFormChange} required style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }} />
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.2rem' }}>{editingUser ? 'Nouveau mot de passe (vide = inchangé)' : 'Mot de passe *'}</label>
                  <input type="password" name="password" value={userForm.password} onChange={handleUserFormChange} required={!editingUser} style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }} />
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.2rem' }}>Nom complet</label>
                  <input type="text" name="full_name" value={userForm.full_name} onChange={handleUserFormChange} style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }} />
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.2rem' }}>Rôle</label>
                  <select name="role" value={userForm.role} onChange={handleUserFormChange} style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }}>
                    <option value="admin">Administrateur</option>
                    <option value="manager">Pharmacien / Gérant</option>
                    <option value="user">Vendeur / Caissier</option>
                  </select>
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.2rem' }}>Permissions</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.3rem' }}>
                    {MODULES.map(mod => (
                      <label key={mod.key} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.9rem', cursor: 'pointer' }}>
                        <input type="checkbox" checked={userForm.permissions?.includes(mod.key) || false} onChange={() => handlePermissionToggle(mod.key)} />
                        {mod.label}
                      </label>
                    ))}
                  </div>
                  <small style={{ color: '#6b7280' }}>Les administrateurs ont accès à tous les modules.</small>
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input type="checkbox" name="active" checked={userForm.active} onChange={handleUserFormChange} />
                    Compte actif
                  </label>
                </div>
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                  <button type="button" onClick={closeUserModal} style={{ padding: '0.5rem 1.5rem', background: '#9ca3af', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer' }}>Annuler</button>
                  <button type="submit" disabled={loading} style={{ padding: '0.5rem 1.5rem', background: PRIMARY, color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', opacity: loading ? 0.7 : 1 }}>
                    {loading ? 'Enregistrement...' : editingUser ? 'Mettre à jour' : 'Ajouter'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* SECTION : Fournisseurs + Médicaments (2 colonnes) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '2rem', marginBottom: '2rem' }}>
        {/* Fournisseur */}
        <div style={{ background: 'white', padding: '1.5rem', borderRadius: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <h3 style={{ marginTop: 0 }}>🏭 Ajouter un fournisseur</h3>
          <form onSubmit={addSeller}>
            <div style={{ marginBottom: '0.5rem' }}>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.2rem' }}>Nom du fournisseur *</label>
              <input type="text" value={newSeller.name} onChange={(e) => setNewSeller({...newSeller, name: e.target.value})} required placeholder="Ex: Labo Pharma SARL" style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }} />
            </div>
            <div style={{ marginBottom: '0.5rem' }}>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.2rem' }}>Personne de contact</label>
              <input type="text" value={newSeller.contact_person} onChange={(e) => setNewSeller({...newSeller, contact_person: e.target.value})} placeholder="Ex: Dr. Ahmed" style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }} />
            </div>
            <div style={{ marginBottom: '0.5rem' }}>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.2rem' }}>Email</label>
              <input type="email" value={newSeller.email} onChange={(e) => setNewSeller({...newSeller, email: e.target.value})} style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }} />
            </div>
            <div style={{ marginBottom: '0.5rem' }}>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.2rem' }}>Téléphone</label>
              <input type="text" value={newSeller.phone} onChange={(e) => setNewSeller({...newSeller, phone: e.target.value})} style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }} />
            </div>
            <div style={{ marginBottom: '0.5rem' }}>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.2rem' }}>Adresse</label>
              <input type="text" value={newSeller.adresse} onChange={(e) => setNewSeller({...newSeller, adresse: e.target.value})} style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }} />
            </div>
            <button type="submit" disabled={loading} style={{ width: '100%', padding: '0.5rem', background: ACCENT, color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer' }}>
              {loading ? 'Ajout...' : 'Ajouter le fournisseur'}
            </button>
          </form>
        </div>

        {/* Médicament */}
        <div style={{ background: 'white', padding: '1.5rem', borderRadius: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <h3 style={{ marginTop: 0 }}>💊 Ajouter un médicament</h3>
          <form onSubmit={addProduct}>
            <div style={{ marginBottom: '0.5rem' }}>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.2rem' }}>Nom commercial *</label>
              <input type="text" name="name" value={newProduct.name} onChange={handleProductChange} required placeholder="Ex: Doliprane" style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <div>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.2rem', fontSize: '0.85rem' }}>DCI / Molécule</label>
                <input type="text" name="dci" value={newProduct.dci} onChange={handleProductChange} placeholder="Paracétamol" style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.2rem', fontSize: '0.85rem' }}>Dosage</label>
                <input type="text" name="dosage" value={newProduct.dosage} onChange={handleProductChange} placeholder="500mg" style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <div>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.2rem', fontSize: '0.85rem' }}>Forme</label>
                <select name="forme" value={newProduct.forme} onChange={handleProductChange} style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }}>
                  {FORMES.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.2rem', fontSize: '0.85rem' }}>Laboratoire</label>
                <input type="text" name="laboratoire" value={newProduct.laboratoire} onChange={handleProductChange} placeholder="Sanofi" style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <div>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.2rem', fontSize: '0.85rem' }}>Prix d'achat (FC)</label>
                <input type="number" name="prix_achat" step="0.01" value={newProduct.prix_achat} onChange={handleProductChange} style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.2rem', fontSize: '0.85rem' }}>Prix de vente (FC) *</label>
                <input type="number" name="unit_price" step="0.01" value={newProduct.unit_price} onChange={handleProductChange} required style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <div>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.2rem', fontSize: '0.85rem' }}>Stock initial</label>
                <input type="number" name="current_stock" value={newProduct.current_stock} onChange={handleProductChange} min="0" style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.2rem', fontSize: '0.85rem' }}>Seuil d'alerte</label>
                <input type="number" name="reorder_level" value={newProduct.reorder_level} onChange={handleProductChange} min="0" style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <div>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.2rem', fontSize: '0.85rem' }}>N° de lot</label>
                <input type="text" name="lot" value={newProduct.lot} onChange={handleProductChange} placeholder="LOT-2026-001" style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.2rem', fontSize: '0.85rem' }}>Date de péremption</label>
                <input type="date" name="date_peremption" value={newProduct.date_peremption} onChange={handleProductChange} style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }} />
              </div>
            </div>
            <button type="submit" disabled={loading} style={{ width: '100%', padding: '0.5rem', background: PRIMARY, color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer' }}>
              {loading ? 'Ajout...' : 'Ajouter le médicament'}
            </button>
          </form>
        </div>
      </div>

      {/* SECTION : Patient */}
      <div style={{ background: 'white', padding: '1.5rem', borderRadius: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', marginBottom: '2rem' }}>
        <h3 style={{ marginTop: 0 }}>🧑‍⚕️ Ajouter un patient</h3>
        <form onSubmit={addClient} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.2rem' }}>Nom complet *</label>
            <input type="text" value={newClient.name} onChange={(e) => setNewClient({...newClient, name: e.target.value})} required style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.2rem' }}>Téléphone *</label>
            <input type="text" value={newClient.phone} onChange={(e) => setNewClient({...newClient, phone: e.target.value})} required style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.2rem' }}>Adresse</label>
            <input type="text" value={newClient.address} onChange={(e) => setNewClient({...newClient, address: e.target.value})} style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.2rem' }}>Date de naissance</label>
            <input type="date" value={newClient.date_naissance} onChange={(e) => setNewClient({...newClient, date_naissance: e.target.value})} style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.2rem' }}>Mutuelle / Assurance</label>
            <input type="text" value={newClient.mutuelle} onChange={(e) => setNewClient({...newClient, mutuelle: e.target.value})} placeholder="Ex: CNSS, RAMED..." style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.2rem' }}>Crédit initial (FC)</label>
            <input type="number" step="0.01" value={newClient.credit_balance} onChange={(e) => setNewClient({...newClient, credit_balance: e.target.value})} style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }} />
          </div>
          <button type="submit" disabled={loading} style={{ gridColumn: '1 / -1', padding: '0.5rem', background: ACCENT, color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer' }}>
            {loading ? 'Ajout...' : 'Ajouter le patient'}
          </button>
        </form>
      </div>

      {/* LISTE FOURNISSEURS */}
      <div style={{ marginTop: '2rem', background: 'white', padding: '1.5rem', borderRadius: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <h3>🏭 Fournisseurs</h3>
        {sellers.length === 0 ? <p style={{ color: '#6b7280' }}>Aucun fournisseur enregistré.</p> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
                  <th style={{ padding: '0.5rem' }}>Nom</th>
                  <th style={{ padding: '0.5rem' }}>Contact</th>
                  <th style={{ padding: '0.5rem' }}>Email</th>
                  <th style={{ padding: '0.5rem' }}>Téléphone</th>
                  <th style={{ padding: '0.5rem' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sellers.map(s => (
                  <tr key={s.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '0.5rem' }}>{s.name}</td>
                    <td style={{ padding: '0.5rem' }}>{s.contact_person || '-'}</td>
                    <td style={{ padding: '0.5rem' }}>{s.email || '-'}</td>
                    <td style={{ padding: '0.5rem' }}>{s.phone || '-'}</td>
                    <td style={{ padding: '0.5rem' }}>
                      <button onClick={() => deleteSeller(s.id)} style={{ background: '#ef4444', color: 'white', border: 'none', padding: '0.25rem 0.75rem', borderRadius: '0.25rem', cursor: 'pointer' }}>Supprimer</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* LISTE MÉDICAMENTS */}
      <div style={{ marginTop: '2rem', background: 'white', padding: '1.5rem', borderRadius: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <h3>💊 Médicaments</h3>
        {products.length === 0 ? <p style={{ color: '#6b7280' }}>Aucun médicament enregistré.</p> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
                  <th style={{ padding: '0.5rem' }}>Nom</th>
                  <th style={{ padding: '0.5rem' }}>DCI</th>
                  <th style={{ padding: '0.5rem' }}>Dosage</th>
                  <th style={{ padding: '0.5rem' }}>Forme</th>
                  <th style={{ padding: '0.5rem' }}>Laboratoire</th>
                  <th style={{ padding: '0.5rem' }}>Prix achat</th>
                  <th style={{ padding: '0.5rem' }}>Prix vente</th>
                  <th style={{ padding: '0.5rem' }}>Stock</th>
                  <th style={{ padding: '0.5rem' }}>Seuil</th>
                  <th style={{ padding: '0.5rem' }}>Péremption</th>
                  <th style={{ padding: '0.5rem', textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map(p => {
                  const peremptionProche = p.date_peremption && new Date(p.date_peremption) < new Date(Date.now() + 30 * 24 * 3600 * 1000);
                  return (
                    <tr key={p.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '0.5rem', fontWeight: 'bold' }}>{p.name}</td>
                      <td style={{ padding: '0.5rem' }}>{p.dci || '-'}</td>
                      <td style={{ padding: '0.5rem' }}>{p.dosage || '-'}</td>
                      <td style={{ padding: '0.5rem' }}>{p.forme || '-'}</td>
                      <td style={{ padding: '0.5rem' }}>{p.laboratoire || '-'}</td>
                      <td style={{ padding: '0.5rem' }}>{p.prix_achat || 0} FC</td>
                      <td style={{ padding: '0.5rem', fontWeight: 'bold', color: PRIMARY }}>{p.unit_price} FC</td>
                      <td style={{ padding: '0.5rem', color: p.current_stock < p.reorder_level ? 'red' : 'inherit', fontWeight: 'bold' }}>{p.current_stock}</td>
                      <td style={{ padding: '0.5rem' }}>{p.reorder_level}</td>
                      <td style={{ padding: '0.5rem', color: peremptionProche ? 'red' : 'inherit' }}>
                        {p.date_peremption ? new Date(p.date_peremption).toLocaleDateString('fr-FR') : '-'}
                      </td>
                      <td style={{ padding: '0.5rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <button onClick={() => openEditProductModal(p)} style={{ background: '#f59e0b', color: 'white', border: 'none', padding: '0.25rem 0.5rem', borderRadius: '0.25rem', cursor: 'pointer', marginRight: '0.3rem', fontSize: '0.8rem' }}>✏️ Modifier</button>
                        <button onClick={() => navigate(`/entrees?product_id=${p.id}`)} style={{ background: ACCENT, color: 'white', border: 'none', padding: '0.25rem 0.5rem', borderRadius: '0.25rem', cursor: 'pointer', marginRight: '0.3rem', fontSize: '0.8rem' }}>Stock</button>
                        <button onClick={() => deleteProduct(p.id)} style={{ background: '#ef4444', color: 'white', border: 'none', padding: '0.25rem 0.5rem', borderRadius: '0.25rem', cursor: 'pointer', fontSize: '0.8rem' }}>Suppr.</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* LISTE PATIENTS */}
      <div style={{ marginTop: '2rem', background: 'white', padding: '1.5rem', borderRadius: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <h3>🧑‍⚕️ Patients</h3>
        {clients.length === 0 ? <p style={{ color: '#6b7280' }}>Aucun patient enregistré.</p> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
                  <th style={{ padding: '0.5rem' }}>Nom</th>
                  <th style={{ padding: '0.5rem' }}>Téléphone</th>
                  <th style={{ padding: '0.5rem' }}>Mutuelle</th>
                  <th style={{ padding: '0.5rem', textAlign: 'right' }}>Crédit</th>
                  <th style={{ padding: '0.5rem' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {clients.map(c => (
                  <tr key={c.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '0.5rem' }}>{c.name}</td>
                    <td style={{ padding: '0.5rem' }}>{c.phone}</td>
                    <td style={{ padding: '0.5rem' }}>{c.mutuelle || '-'}</td>
                    <td style={{ padding: '0.5rem', textAlign: 'right' }}>{c.credit_balance || 0} FC</td>
                    <td style={{ padding: '0.5rem' }}>
                      <button onClick={() => deleteClient(c.id)} style={{ background: '#ef4444', color: 'white', border: 'none', padding: '0.25rem 0.75rem', borderRadius: '0.25rem', cursor: 'pointer' }}>Supprimer</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ===== MODAL DE MODIFICATION D'UN MÉDICAMENT ===== */}
      {showEditProductModal && editingProduct && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000 }}>
          <div style={{ background: 'white', padding: '2rem', borderRadius: '1rem', maxWidth: '600px', width: '100%', maxHeight: '90vh', overflow: 'auto' }}>
            <h2 style={{ marginTop: 0, color: PRIMARY }}>✏️ Modifier le médicament</h2>
            <form onSubmit={updateProduct}>
              <div style={{ marginBottom: '0.8rem' }}>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.2rem' }}>Nom commercial *</label>
                <input type="text" name="name" value={editProductForm.name} onChange={handleEditProductChange} required style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }} />
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', marginBottom: '0.8rem' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.2rem' }}>DCI</label>
                  <input type="text" name="dci" value={editProductForm.dci} onChange={handleEditProductChange} style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.2rem' }}>Dosage</label>
                  <input type="text" name="dosage" value={editProductForm.dosage} onChange={handleEditProductChange} style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', marginBottom: '0.8rem' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.2rem' }}>Forme</label>
                  <select name="forme" value={editProductForm.forme} onChange={handleEditProductChange} style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }}>
                    {FORMES.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.2rem' }}>Laboratoire</label>
                  <input type="text" name="laboratoire" value={editProductForm.laboratoire} onChange={handleEditProductChange} style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', marginBottom: '0.8rem' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.2rem' }}>Prix d'achat (FC)</label>
                  <input type="number" name="prix_achat" step="0.01" value={editProductForm.prix_achat} onChange={handleEditProductChange} style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.2rem', color: DANGER }}>Prix de vente (FC) *</label>
                  <input type="number" name="unit_price" step="0.01" value={editProductForm.unit_price} onChange={handleEditProductChange} required style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '2px solid #f59e0b', fontSize: '1.05rem', fontWeight: 'bold' }} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', marginBottom: '0.8rem' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.2rem' }}>Stock actuel</label>
                  <input type="number" name="current_stock" value={editProductForm.current_stock} onChange={handleEditProductChange} min="0" style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.2rem' }}>Seuil d'alerte</label>
                  <input type="number" name="reorder_level" value={editProductForm.reorder_level} onChange={handleEditProductChange} min="0" style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', marginBottom: '1.5rem' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.2rem' }}>N° de lot</label>
                  <input type="text" name="lot" value={editProductForm.lot} onChange={handleEditProductChange} style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.2rem' }}>Date de péremption</label>
                  <input type="date" name="date_peremption" value={editProductForm.date_peremption} onChange={handleEditProductChange} style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                <button type="button" onClick={closeEditProductModal} style={{ padding: '0.5rem 1.5rem', background: '#9ca3af', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer' }}>Annuler</button>
                <button type="submit" disabled={loading} style={{ padding: '0.5rem 1.5rem', background: PRIMARY, color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 'bold', opacity: loading ? 0.7 : 1 }}>
                  {loading ? 'Enregistrement...' : 'Enregistrer les modifications'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Admin;