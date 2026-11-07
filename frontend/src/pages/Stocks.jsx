import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import db from '../db';
import { syncAll } from '../services/syncService';

const Stocks = () => {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({ totalBottles: 0, totalPackets: 0 });
  const [dailyData, setDailyData] = useState([]);
  const [dailyDate, setDailyDate] = useState('');
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    fetchData();
    fetchDailyData();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      // 1. Lire depuis la base locale (Dexie)
      const localProducts = await db.products.toArray();
      if (localProducts.length > 0) {
        setProducts(localProducts);
        updateStats(localProducts);
      } else {
        // Aucune donnée locale
        setError('Aucune donnée disponible. Connectez-vous pour synchroniser.');
      }

      // 2. Si connecté, synchroniser en arrière‑plan
      if (isOnline) {
        await syncAll(); // synchronise toutes les tables
        // Recharger les produits après synchronisation
        const updatedProducts = await db.products.toArray();
        if (updatedProducts.length > 0) {
          setProducts(updatedProducts);
          updateStats(updatedProducts);
          setError(null);
        }
      }
    } catch (err) {
      console.error(err);
      if (!isOnline && products.length === 0) {
        setError('Mode hors ligne - aucune donnée locale disponible');
      } else if (isOnline) {
        setError('Erreur de synchronisation');
      }
    } finally {
      setLoading(false);
    }
  };

  const updateStats = (productsData) => {
    let totalBottles = 0;
    let totalPackets = 0;
    productsData.forEach(p => {
      totalBottles += p.current_stock || 0;
      const bottlesPerPack = p.bottles_per_pack || 12;
      totalPackets += Math.floor((p.current_stock || 0) / bottlesPerPack);
    });
    setStats({ totalBottles, totalPackets });
  };

  const fetchDailyData = async () => {
    try {
      // Récupérer tous les produits et mouvements locaux
      const allProducts = await db.products.toArray();
      const allMovements = await db.stockMovements.toArray();

      // Définir la plage de date (jour actuel)
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

      // Filtrer les mouvements du jour
      const todayMovements = allMovements.filter(m => {
        const d = new Date(m.created_at);
        return d >= startOfDay && d < endOfDay;
      });

      // Construire le suivi par produit
      const productMap = {};
      allProducts.forEach(p => {
        productMap[p.id] = {
          id: p.id,
          name: p.name,
          current_stock: p.current_stock,
          reorder_level: p.reorder_level,
          size: p.size,
          bottles_per_pack: p.bottles_per_pack || 12,
          initialStock: 0,
          entries: 0,
          exits: 0,
          finalStock: p.current_stock,
        };
      });

      // Calculer les entrées/sorties du jour
      todayMovements.forEach(m => {
        const pid = m.product_id;
        if (!productMap[pid]) return;
        const qty = Math.abs(m.quantity_change);
        const type = m.movement_type;
        if (type === 'supplier_in' || type === 'cooperant_return') {
          productMap[pid].entries += qty;
        } else if (type === 'cooperant_take' || type === 'retail_sale') {
          productMap[pid].exits += qty;
        }
      });

      // Calculer le stock initial
      const result = Object.values(productMap).map(p => {
        const initialStock = p.current_stock - p.entries + p.exits;
        return {
          ...p,
          initialStock: Math.max(initialStock, 0),
          finalStock: p.current_stock,
        };
      });

      setDailyData(result);
      setDailyDate(today.toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      }));
    } catch (err) {
      console.error('Erreur suivi journalier local:', err);
    }
  };

  const handleRefresh = async () => {
    setLoading(true);
    await fetchData();
    await fetchDailyData();
    setLoading(false);
  };

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
      <div style={{ fontSize: '1.5rem', color: '#3b82f6' }}>Chargement des stocks...</div>
    </div>
  );

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ color: '#1e3a8a', fontSize: '2rem' }}>📦 Gestion des stocks</h1>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <span style={{
            fontSize: '0.8rem',
            padding: '0.2rem 0.8rem',
            borderRadius: '1rem',
            background: isOnline ? '#d1fae5' : '#fecaca',
            color: isOnline ? '#065f46' : '#991b1b',
            display: 'flex',
            alignItems: 'center'
          }}>
            {isOnline ? '🟢 En ligne' : '🔴 Hors ligne'}
          </span>
          <button
            onClick={() => navigate('/entrees')}
            style={{ background: '#10b981', color: 'white', padding: '0.5rem 1rem', border: 'none', borderRadius: '0.5rem', cursor: 'pointer' }}
          >
            ➕ Ajouter du stock
          </button>
          <button
            onClick={handleRefresh}
            style={{ background: '#3b82f6', color: 'white', padding: '0.5rem 1rem', border: 'none', borderRadius: '0.5rem', cursor: 'pointer' }}
          >
            🔄 Rafraîchir
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: '0.75rem', borderRadius: '0.5rem', marginBottom: '1rem', background: '#fef3c7', color: '#92400e' }}>
          ⚠️ {error}
        </div>
      )}

      {/* Indicateurs rapides */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', marginBottom: '2rem' }}>
        <div style={{ background: 'white', padding: '1rem', borderRadius: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <p style={{ color: '#374151', fontSize: '0.9rem' }}>Total produits</p>
          <h2 style={{ fontSize: '2rem', fontWeight: 'bold', margin: '0.5rem 0', color: '#1f2937' }}>{products.length}</h2>
        </div>
        <div style={{ background: 'white', padding: '1rem', borderRadius: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <p style={{ color: '#374151', fontSize: '0.9rem' }}>Stock total (bouteilles)</p>
          <h2 style={{ fontSize: '2rem', fontWeight: 'bold', margin: '0.5rem 0', color: '#1f2937' }}>{stats.totalBottles}</h2>
        </div>
        <div style={{ background: 'white', padding: '1rem', borderRadius: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <p style={{ color: '#374151', fontSize: '0.9rem' }}>Stock total (paquets)</p>
          <h2 style={{ fontSize: '2rem', fontWeight: 'bold', margin: '0.5rem 0', color: '#1f2937' }}>{stats.totalPackets}</h2>
        </div>
      </div>

      {/* Suivi journalier des stocks */}
      <div style={{ background: 'white', padding: '1.5rem', borderRadius: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', marginBottom: '2rem' }}>
        <h3 style={{ marginTop: 0, marginBottom: '0.5rem', color: '#1f2937' }}>
          📋 Suivi journalier des stocks ({dailyDate})
        </h3>
        {dailyData.length === 0 ? (
          <p style={{ color: '#6b7280' }}>Aucune donnée disponible pour aujourd'hui.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
                  <th style={{ padding: '0.5rem', color: '#1f2937' }}>Produit</th>
                  <th style={{ padding: '0.5rem', textAlign: 'center', color: '#1f2937' }}>Stock initial</th>
                  <th style={{ padding: '0.5rem', textAlign: 'center', color: '#1f2937' }}>Entrées</th>
                  <th style={{ padding: '0.5rem', textAlign: 'center', color: '#1f2937' }}>Sorties</th>
                  <th style={{ padding: '0.5rem', textAlign: 'center', color: '#1f2937' }}>Stock final</th>
                  <th style={{ padding: '0.5rem', textAlign: 'center', color: '#1f2937' }}>État</th>
                  <th style={{ padding: '0.5rem', textAlign: 'center', color: '#1f2937' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {dailyData.map((item, idx) => {
                  const isCritical = item.finalStock < item.reorder_level;
                  return (
                    <tr key={item.id || idx} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '0.5rem', color: '#1f2937' }}>{item.name}</td>
                      <td style={{ padding: '0.5rem', textAlign: 'center', color: '#1f2937' }}>{item.initialStock}</td>
                      <td style={{ padding: '0.5rem', textAlign: 'center', color: '#10b981' }}>{item.entries}</td>
                      <td style={{ padding: '0.5rem', textAlign: 'center', color: '#ef4444' }}>{item.exits}</td>
                      <td style={{ padding: '0.5rem', textAlign: 'center', color: isCritical ? 'red' : '#1f2937' }}>
                        {item.finalStock}
                      </td>
                      <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                        <span style={{
                          background: isCritical ? '#fecaca' : '#d1fae5',
                          color: isCritical ? '#991b1b' : '#065f46',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '0.25rem',
                          fontSize: '0.8rem'
                        }}>
                          {isCritical ? '⚠️ Critique' : '✅ Normal'}
                        </span>
                      </td>
                      <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                        <button
                          onClick={() => navigate(`/entrees?product_id=${item.id}`)}
                          style={{ background: '#10b981', color: 'white', border: 'none', padding: '0.25rem 0.75rem', borderRadius: '0.25rem', cursor: 'pointer' }}
                        >
                          Ajouter
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Tableau des produits avec stock détaillé */}
      <div style={{ background: 'white', padding: '1.5rem', borderRadius: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <h3 style={{ marginTop: 0, marginBottom: '1rem', color: '#1f2937' }}>📦 Stock détaillé des produits</h3>
        {products.length === 0 ? (
          <p style={{ color: '#6b7280' }}>Aucun produit enregistré.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
                  <th style={{ padding: '0.5rem', color: '#1f2937' }}>Nom</th>
                  <th style={{ padding: '0.5rem', color: '#1f2937' }}>Taille</th>
                  <th style={{ padding: '0.5rem', textAlign: 'center', color: '#1f2937' }}>Bouteilles/Paquet</th>
                  <th style={{ padding: '0.5rem', textAlign: 'center', color: '#1f2937' }}>Stock (bouteilles)</th>
                  <th style={{ padding: '0.5rem', textAlign: 'center', color: '#1f2937' }}>Stock (paquets)</th>
                  <th style={{ padding: '0.5rem', textAlign: 'center', color: '#1f2937' }}>Seuil</th>
                  <th style={{ padding: '0.5rem', textAlign: 'center', color: '#1f2937' }}>État</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p, idx) => {
                  const bottlesPerPack = p.bottles_per_pack || 12;
                  const stockPackets = Math.floor(p.current_stock / bottlesPerPack);
                  const stockBottles = p.current_stock % bottlesPerPack;
                  const isCritical = p.current_stock < p.reorder_level;
                  return (
                    <tr key={p.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '0.5rem', color: '#1f2937' }}>{p.name}</td>
                      <td style={{ padding: '0.5rem', color: '#1f2937' }}>{p.size === 'big' ? 'Grande' : 'Petite'}</td>
                      <td style={{ padding: '0.5rem', textAlign: 'center', color: '#1f2937' }}>{bottlesPerPack}</td>
                      <td style={{ padding: '0.5rem', textAlign: 'center', color: isCritical ? 'red' : '#1f2937' }}>
                        {p.current_stock}
                      </td>
                      <td style={{ padding: '0.5rem', textAlign: 'center', color: '#1f2937' }}>
                        {stockPackets} paquets{stockBottles > 0 ? ` + ${stockBottles} bouteilles` : ''}
                      </td>
                      <td style={{ padding: '0.5rem', textAlign: 'center', color: '#1f2937' }}>{p.reorder_level}</td>
                      <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                        <span style={{
                          background: isCritical ? '#fecaca' : '#d1fae5',
                          color: isCritical ? '#991b1b' : '#065f46',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '0.25rem',
                          fontSize: '0.8rem'
                        }}>
                          {isCritical ? '⚠️ Critique' : '✅ Normal'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Stocks;