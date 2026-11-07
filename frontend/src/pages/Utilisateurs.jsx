import { useEffect, useState } from 'react';
import api from '../services/api';
import db from '../db';
import { syncAll } from '../services/syncService';

const PRIMARY = '#065f46';
const ACCENT = '#10b981';
const WARN = '#f59e0b';
const DANGER = '#dc2626';

// ✅ LISTE COMPLÈTE DE TOUS LES MODULES DISPONIBLES
const AVAILABLE_MODULES = [
  { key: 'dashboard', label: '📊 Tableau de bord' },
  { key: 'stocks', label: '📦 Gestion des stocks' },
  { key: 'entrees', label: '📥 Entrées de médicaments' },
  { key: 'sorties', label: '💰 Ventes de médicaments' },
  { key: 'ajustements', label: '🔄 Ajustements de stock' },
  { key: 'clients', label: '🧑‍⚕️ Gestion des patients' },
  { key: 'vendeurs', label: '🤝 Pharmaciens & Employés' },
  { key: 'caisse', label: '💵 Caisse / Journal' },
  { key: 'rapports', label: '📈 Rapports & Statistiques' },
  { key: 'parametres', label: '⚙️ Paramètres' },
  { key: 'sauvegarde', label: '💾 Sauvegarde' },
  { key: 'etiquettes', label: '🏷️ Étiquettes / QR Codes' },
  { key: 'fournisseurs', label: '🏭 Fournisseurs' },
  { key: 'mouvements', label: '📋 Journal des mouvements' },
  { key: 'alertes-peremption', label: '⏰ Alertes péremption' },
  { key: 'alertes-stock', label: '⚠️ Alertes stock bas' },
  { key: 'ordonnances', label: '📝 Ordonnances' },
  { key: 'commandes', label: '🚚 Commandes fournisseurs' },
  { key: 'inventaire', label: '📦 Inventaire' },
  { key: 'retours', label: '🔄 Retours clients' },
];

const Utilisateurs = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    full_name: '',
    role: 'user',
    active: true,
    permissions: [],
  });

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const localUsers = await db.users.toArray();
      if (localUsers.length > 0) {
        setUsers(localUsers);
        setError(null);
      }

      if (navigator.onLine) {
        const response = await api.get('/users');
        if (response.data.success) {
          const serverUsers = response.data.data;
          await db.users.clear();
          await db.users.bulkPut(serverUsers);
          setUsers(serverUsers);
          setError(null);
        } else {
          setError('Erreur de chargement des utilisateurs depuis le serveur');
        }
      } else {
        if (localUsers.length === 0) {
          setError('Aucune donnée disponible hors ligne. Connectez-vous pour synchroniser.');
        }
      }
    } catch (err) {
      console.error(err);
      if (!navigator.onLine) {
        setError('Mode hors ligne - données locales affichées');
      } else {
        setError('Impossible de contacter le serveur');
      }
    } finally {
      setLoading(false);
    }
  };

  const openModal = (user = null) => {
    if (user) {
      setEditingUser(user);
      setFormData({
        email: user.email,
        password: '',
        full_name: user.full_name || '',
        role: user.role,
        active: user.active,
        permissions: user.permissions || [],
      });
    } else {
      setEditingUser(null);
      setFormData({
        email: '',
        password: '',
        full_name: '',
        role: 'user',
        active: true,
        permissions: ['dashboard', 'sorties', 'stocks'],
      });
    }
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingUser(null);
    setFormData({ email: '', password: '', full_name: '', role: 'user', active: true, permissions: [] });
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handlePermissionToggle = (moduleKey) => {
    setFormData(prev => {
      const hasIt = prev.permissions.includes(moduleKey);
      const newPermissions = hasIt
        ? prev.permissions.filter(p => p !== moduleKey)
        : [...prev.permissions, moduleKey];
      return { ...prev, permissions: newPermissions };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.email || (!editingUser && !formData.password)) {
      setError('L\'email et le mot de passe sont requis');
      return;
    }
    try {
      let response;
      if (editingUser) {
        response = await api.put(`/users/${editingUser.id}`, formData);
      } else {
        response = await api.post('/users', formData);
      }
      if (response.data.success) {
        closeModal();
        await syncAll();
        await fetchUsers();
      } else {
        setError(response.data.error || 'Erreur');
      }
    } catch (err) {
      console.error(err);
      setError('Erreur serveur');
    }
  };

  const deleteUser = async (id) => {
    if (!window.confirm('Supprimer cet utilisateur définitivement ?')) return;
    try {
      await api.delete(`/users/${id}`);
      await syncAll();
      await fetchUsers();
    } catch (err) {
      console.error(err);
      setError('Erreur suppression');
    }
  };

  // ===== FONCTIONS DE SUIVI DE CONNEXION =====
  const getStatus = (lastLogin) => {
    if (!lastLogin) return { text: 'Jamais connecté', color: '#9ca3af', dot: '⚪' };
    
    const last = new Date(lastLogin);
    const now = new Date();
    const diffMinutes = (now - last) / 1000 / 60;

    if (diffMinutes < 15) {
      return { text: 'En ligne', color: ACCENT, dot: '🟢' };
    }
    return { text: 'Hors ligne', color: '#6b7280', dot: '⚪' };
  };

  const formatLastLogin = (lastLogin) => {
    if (!lastLogin) return '-';
    const date = new Date(lastLogin);
    const now = new Date();
    
    const isToday = date.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = yesterday.toDateString() === date.toDateString();

    const time = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    if (isToday) return `Aujourd'hui à ${time}`;
    if (isYesterday) return `Hier à ${time}`;
    return date.toLocaleDateString('fr-FR') + ` à ${time}`;
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
        <div style={{ fontSize: '1.5rem', color: ACCENT }}>Chargement...</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', paddingTop: '100px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ color: PRIMARY, marginBottom: '0.25rem' }}>👥 Gestion des utilisateurs</h1>
          <p style={{ color: '#6b7280' }}>Suivez qui est en ligne et gérez les accès au système</p>
        </div>
        <button
          onClick={() => openModal()}
          style={{ background: ACCENT, color: 'white', padding: '0.6rem 1.5rem', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold' }}
        >
          ➕ Nouvel utilisateur
        </button>
      </div>

      {error && (
        <div style={{ padding: '0.75rem', borderRadius: '0.5rem', marginBottom: '1rem', background: '#fecaca', color: '#991b1b' }}>
          {error}
        </div>
      )}

      {users.length === 0 ? (
        <p style={{ color: '#6b7280' }}>Aucun utilisateur enregistré.</p>
      ) : (
        <div style={{ overflowX: 'auto', background: 'white', borderRadius: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', padding: '1rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
                <th style={{ padding: '0.75rem', color: '#1f2937' }}>Utilisateur</th>
                <th style={{ padding: '0.75rem', color: '#1f2937' }}>Email</th>
                <th style={{ padding: '0.75rem', color: '#1f2937' }}>Rôle</th>
                <th style={{ padding: '0.75rem', color: '#1f2937' }}>Statut</th>
                <th style={{ padding: '0.75rem', color: '#1f2937' }}>Dernière connexion</th>
                <th style={{ padding: '0.75rem', textAlign: 'center', color: '#1f2937' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => {
                const status = getStatus(u.last_login);
                return (
                  <tr key={u.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '0.75rem' }}>
                      <div style={{ fontWeight: 'bold', color: '#1f2937' }}>{u.full_name || 'Sans nom'}</div>
                      <div style={{ fontSize: '0.75rem', color: u.active ? ACCENT : DANGER, fontWeight: 'bold' }}>
                        {u.active ? 'Compte Actif' : 'Compte Désactivé'}
                      </div>
                    </td>
                    <td style={{ padding: '0.75rem', color: '#4b5563' }}>{u.email}</td>
                    <td style={{ padding: '0.75rem' }}>
                      <span style={{ 
                        background: u.role === 'admin' ? '#fef3c7' : u.role === 'manager' ? '#e0e7ff' : '#f3f4f6',
                        color: u.role === 'admin' ? '#92400e' : u.role === 'manager' ? '#3730a3' : '#374151',
                        padding: '0.2rem 0.5rem', borderRadius: '0.3rem', fontSize: '0.75rem', fontWeight: 'bold'
                      }}>
                        {u.role === 'admin' ? '👑 Admin' : u.role === 'manager' ? '👔 Manager' : '👤 Utilisateur'}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem' }}>
                      <span style={{ color: status.color, fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        {status.dot} {status.text}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem', color: '#6b7280', fontSize: '0.85rem' }}>
                      {formatLastLogin(u.last_login)}
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                      <button
                        onClick={() => openModal(u)}
                        style={{ background: '#fef3c7', color: '#b45309', border: '1px solid #fcd34d', padding: '0.3rem 0.6rem', borderRadius: '0.3rem', cursor: 'pointer', marginRight: '0.3rem', fontSize: '0.8rem' }}
                      >
                        ✏️ Modifier
                      </button>
                      <button
                        onClick={() => deleteUser(u.id)}
                        style={{ background: '#fee2e2', color: DANGER, border: '1px solid #fca5a5', padding: '0.3rem 0.6rem', borderRadius: '0.3rem', cursor: 'pointer', fontSize: '0.8rem' }}
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal d'ajout / modification */}
      {showModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, width: '100%', height: '100%',
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            background: 'white',
            padding: '2rem',
            borderRadius: '1rem',
            maxWidth: '600px',
            width: '100%',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
          }}>
            <h2 style={{ marginTop: 0, color: PRIMARY }}>{editingUser ? '✏️ Modifier l\'utilisateur' : '➕ Nouvel utilisateur'}</h2>
            <form onSubmit={handleSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.3rem', color: '#1f2937' }}>Nom complet</label>
                  <input
                    type="text"
                    name="full_name"
                    value={formData.full_name}
                    onChange={handleChange}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db', color: '#1f2937' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.3rem', color: '#1f2937' }}>Email *</label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db', color: '#1f2937' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.3rem', color: '#1f2937' }}>
                    {editingUser ? 'Nouveau mot de passe (vide = inchangé)' : 'Mot de passe *'}
                  </label>
                  <input
                    type="password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    required={!editingUser}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db', color: '#1f2937' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.3rem', color: '#1f2937' }}>Rôle de base</label>
                  <select
                    name="role"
                    value={formData.role}
                    onChange={handleChange}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db', color: '#1f2937' }}
                  >
                    <option value="admin">👑 Administrateur (Accès total)</option>
                    <option value="manager">👔 Manager</option>
                    <option value="user">👤 Utilisateur</option>
                  </select>
                </div>
              </div>

              {/* ✅ GRILLE DES PERMISSIONS */}
              {formData.role !== 'admin' && (
                <div style={{ marginTop: '1.5rem', background: '#f9fafb', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #e5e7eb' }}>
                  <h4 style={{ margin: '0 0 0.5rem 0', color: '#374151', fontSize: '0.95rem' }}>🔐 Modules autorisés</h4>
                  <p style={{ margin: '0 0 1rem 0', fontSize: '0.8rem', color: '#6b7280' }}>
                    Cochez les modules auxquels cet utilisateur a accès.
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    {AVAILABLE_MODULES.map(mod => (
                      <label key={mod.key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', cursor: 'pointer', color: '#1f2937' }}>
                        <input
                          type="checkbox"
                          checked={formData.permissions.includes(mod.key)}
                          onChange={() => handlePermissionToggle(mod.key)}
                          style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                        />
                        {mod.label}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ marginTop: '1.5rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#1f2937', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    name="active"
                    checked={formData.active}
                    onChange={handleChange}
                  />
                  Compte actif (décocher pour bloquer l'accès)
                </label>
              </div>

              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '2rem' }}>
                <button type="button" onClick={closeModal} style={{ padding: '0.5rem 1.5rem', background: '#9ca3af', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer' }}>
                  Annuler
                </button>
                <button type="submit" style={{ padding: '0.5rem 1.5rem', background: PRIMARY, color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 'bold' }}>
                  {editingUser ? 'Mettre à jour' : 'Créer le compte'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Utilisateurs;