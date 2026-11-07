import { useEffect, useState } from 'react';
import db from '../db';
import { syncAll } from '../services/syncService';

// Couleurs pharmacie
const PRIMARY = '#065f46';
const ACCENT = '#10b981';
const WARN = '#f59e0b';
const DANGER = '#dc2626';

const Dashboard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadData = async () => {
    try {
      const [products, movements, sales] = await Promise.all([
        db.products.toArray(),
        db.stockMovements.toArray(),
        db.sales.toArray(),
      ]);

      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

      // ===== 1. Ventes du jour =====
      const todaySales = sales.filter(s => {
        const d = new Date(s.sale_date);
        return d >= startOfDay && d < endOfDay;
      });

      const caJour = todaySales.reduce((sum, s) => sum + (s.total_amount || 0), 0);
      const nbVentesJour = todaySales.length;

      // Répartition par moyen de paiement
      const paymentStats = {};
      todaySales.forEach(s => {
        const key = s.payment_method || 'cash';
        paymentStats[key] = (paymentStats[key] || 0) + (s.total_amount || 0);
      });

      // ===== 2. Mouvements de stock du jour =====
      const todayMovements = movements.filter(m => {
        const d = new Date(m.created_at || m.date);
        return d >= startOfDay && d < endOfDay;
      });

      // Top médicaments vendus aujourd'hui (sorties)
      const productSalesMap = {};
      todayMovements.forEach(m => {
        if (m.movement_type === 'retail_sale' || m.movement_type === 'cooperant_take') {
          const pid = m.product_id;
          const qty = Math.abs(m.quantity_change);
          if (!productSalesMap[pid]) productSalesMap[pid] = 0;
          productSalesMap[pid] += qty;
        }
      });

      const topProducts = Object.entries(productSalesMap)
        .map(([pid, qty]) => {
          const p = products.find(x => x.id === pid);
          return {
            id: pid,
            name: p?.name || 'Inconnu',
            dci: p?.dci || '',
            qty,
            amount: qty * (p?.unit_price || 0),
          };
        })
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 5);

      const maxQtySold = topProducts.length > 0 ? topProducts[0].qty : 1;

      // ===== 3. Stock global =====
      const totalStockQuantity = products.reduce((sum, p) => sum + (p.current_stock || 0), 0);
      const totalStockValue = products.reduce(
        (sum, p) => sum + (p.current_stock || 0) * (p.prix_achat || 0),
        0
      );
      const nbMedicaments = products.length;
      const nbMedicamentsEnStock = products.filter(p => (p.current_stock || 0) > 0).length;

      // ===== 4. Alertes stock bas =====
      const stockAlerts = products.filter(
        p => (p.current_stock || 0) <= (p.reorder_level || 0)
      );

      // ===== 5. Alertes péremption =====
      const now = new Date();
      const in30Days = new Date(now.getTime() + 30 * 24 * 3600 * 1000);
      const peremptionAlerts = products
        .filter(p => p.date_peremption)
        .map(p => {
          const exp = new Date(p.date_peremption);
          const diffDays = Math.floor((exp - now) / (24 * 3600 * 1000));
          return { ...p, diffDays };
        })
        .filter(p => p.diffDays <= 30)
        .sort((a, b) => a.diffDays - b.diffDays);

      // ===== 6. Valeur totale du stock + marge potentielle =====
      const totalStockSellValue = products.reduce(
        (sum, p) => sum + (p.current_stock || 0) * (p.unit_price || 0),
        0
      );

      setData({
        caJour,
        nbVentesJour,
        paymentStats,
        topProducts,
        maxQtySold,
        totalStockQuantity,
        totalStockValue,
        totalStockSellValue,
        nbMedicaments,
        nbMedicamentsEnStock,
        stockAlerts,
        peremptionAlerts,
        allProducts: products,
        date: startOfDay.toISOString().split('T')[0],
      });
      setError(null);
    } catch (err) {
      console.error('Erreur chargement dashboard:', err);
      setError('Impossible de charger les données locales');
    } finally {
      setLoading(false);
    }
  };

  const refreshData = async () => {
    if (navigator.onLine) {
      try {
        await syncAll();
      } catch (e) {
        console.warn('Erreur sync:', e);
      }
    }
    await loadData();
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(refreshData, 30000);
    return () => clearInterval(interval);
  }, []);

  // ===== Rendus =====
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
        <div style={{ fontSize: '1.5rem', color: ACCENT }}>Chargement du tableau de bord...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '2rem', color: 'red' }}>
        <h1>Erreur</h1>
        <p>{error}</p>
      </div>
    );
  }

  if (!data) return <div>Aucune donnée disponible</div>;

  const {
    caJour, nbVentesJour, paymentStats, topProducts, maxQtySold,
    totalStockQuantity, totalStockValue, totalStockSellValue,
    nbMedicaments, nbMedicamentsEnStock,
    stockAlerts, peremptionAlerts, allProducts, date,
  } = data;

  const margePotentielle = totalStockSellValue - totalStockValue;

  const paymentLabel = (pm) => {
    switch (pm) {
      case 'cash': return 'Espèces';
      case 'bank': return 'Banque';
      case 'mobile_money': return 'Mobile money';
      case 'assurance': return 'Assurance / Mutuelle';
      case 'credit': return 'Crédit';
      default: return 'Autre';
    }
  };

  const paymentColor = (pm) => {
    switch (pm) {
      case 'cash': return ACCENT;
      case 'bank': return '#3b82f6';
      case 'mobile_money': return '#8b5cf6';
      case 'assurance': return WARN;
      case 'credit': return DANGER;
      default: return '#6b7280';
    }
  };

  return (
    <div style={{ padding: '2rem', background: '#f4f6f9', minHeight: '100vh' }}>
      {/* En-tête */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ color: PRIMARY, fontSize: '2rem' }}>📊 Tableau de bord — Pharmacie Le Frasah</h1>
        <span style={{ color: PRIMARY, fontSize: '0.9rem', background: '#e5e7eb', padding: '0.3rem 0.8rem', borderRadius: '0.5rem' }}>
          Mise à jour : {new Date().toLocaleTimeString('fr-FR')}
        </span>
      </div>
      <p style={{ color: '#1f2937', marginBottom: '2rem', fontSize: '1rem' }}>
        Synthèse du jour : {new Date(date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
      </p>

      {/* ===== KPI CARDS ===== */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '1rem', marginBottom: '2.5rem' }}>
        <div style={{ background: 'white', padding: '1rem', borderRadius: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', borderLeft: `4px solid ${ACCENT}` }}>
          <p style={{ color: '#374151', fontSize: '0.8rem', margin: 0 }}>💰 CA du jour</p>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 'bold', margin: '0.2rem 0', color: PRIMARY }}>{caJour.toFixed(0)} FC</h2>
          <small style={{ color: '#6b7280' }}>Chiffre d'affaires</small>
        </div>
        <div style={{ background: 'white', padding: '1rem', borderRadius: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', borderLeft: `4px solid #3b82f6` }}>
          <p style={{ color: '#374151', fontSize: '0.8rem', margin: 0 }}>🛒 Ventes du jour</p>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 'bold', margin: '0.2rem 0', color: PRIMARY }}>{nbVentesJour}</h2>
          <small style={{ color: '#6b7280' }}>Transactions</small>
        </div>
        <div style={{ background: 'white', padding: '1rem', borderRadius: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', borderLeft: `4px solid ${PRIMARY}` }}>
          <p style={{ color: '#374151', fontSize: '0.8rem', margin: 0 }}>💊 Médicaments</p>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 'bold', margin: '0.2rem 0', color: PRIMARY }}>{nbMedicamentsEnStock}/{nbMedicaments}</h2>
          <small style={{ color: '#6b7280' }}>En stock / Total</small>
        </div>
        <div style={{ background: 'white', padding: '1rem', borderRadius: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', borderLeft: `4px solid #8b5cf6` }}>
          <p style={{ color: '#374151', fontSize: '0.8rem', margin: 0 }}>📦 Stock total</p>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 'bold', margin: '0.2rem 0', color: PRIMARY }}>{totalStockQuantity}</h2>
          <small style={{ color: '#6b7280' }}>Unités</small>
        </div>
        <div style={{ background: 'white', padding: '1rem', borderRadius: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', borderLeft: `4px solid ${WARN}` }}>
          <p style={{ color: '#374151', fontSize: '0.8rem', margin: 0 }}>⚠️ Stock bas</p>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 'bold', margin: '0.2rem 0', color: stockAlerts.length > 0 ? DANGER : PRIMARY }}>{stockAlerts.length}</h2>
          <small style={{ color: '#6b7280' }}>Alertes</small>
        </div>
        <div style={{ background: 'white', padding: '1rem', borderRadius: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', borderLeft: `4px solid ${DANGER}` }}>
          <p style={{ color: '#374151', fontSize: '0.8rem', margin: 0 }}>⏰ Péremption</p>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 'bold', margin: '0.2rem 0', color: peremptionAlerts.length > 0 ? DANGER : PRIMARY }}>{peremptionAlerts.length}</h2>
          <small style={{ color: '#6b7280' }}>≤ 30 jours</small>
        </div>
      </div>

      {/* ===== Valeur du stock ===== */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
        <div style={{ background: 'white', padding: '1rem', borderRadius: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <p style={{ color: '#374151', fontSize: '0.8rem', margin: 0 }}>💵 Valeur du stock (achat)</p>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: '0.2rem 0', color: '#1f2937' }}>{totalStockValue.toFixed(0)} FC</h2>
        </div>
        <div style={{ background: 'white', padding: '1rem', borderRadius: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <p style={{ color: '#374151', fontSize: '0.8rem', margin: 0 }}>💵 Valeur du stock (vente)</p>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: '0.2rem 0', color: '#1f2937' }}>{totalStockSellValue.toFixed(0)} FC</h2>
        </div>
        <div style={{ background: 'white', padding: '1rem', borderRadius: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <p style={{ color: '#374151', fontSize: '0.8rem', margin: 0 }}>📈 Marge potentielle</p>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: '0.2rem 0', color: ACCENT }}>{margePotentielle.toFixed(0)} FC</h2>
        </div>
      </div>

      {/* ===== Top médicaments + Paiements ===== */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem', marginBottom: '2rem' }}>
        <div style={{ background: 'white', padding: '1.5rem', borderRadius: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <h3 style={{ marginTop: 0, marginBottom: '1rem', color: '#1f2937' }}>🏆 Top 5 médicaments vendus</h3>
          {topProducts.length === 0 ? (
            <p style={{ color: '#6b7280' }}>Aucune vente enregistrée aujourd'hui.</p>
          ) : (
            <div>
              {topProducts.map((p, idx) => (
                <div key={idx} style={{ marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: '#1f2937' }}>
                    <span><strong>{p.name}</strong> {p.dci && <small style={{ color: '#6b7280' }}>— {p.dci}</small>}</span>
                    <span>{p.qty} unités ({p.amount.toFixed(0)} FC)</span>
                  </div>
                  <div style={{ width: '100%', height: '8px', background: '#e5e7eb', borderRadius: '4px', marginTop: '0.2rem' }}>
                    <div style={{ width: `${(p.qty / maxQtySold) * 100}%`, height: '100%', background: ACCENT, borderRadius: '4px' }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ background: 'white', padding: '1.5rem', borderRadius: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <h3 style={{ marginTop: 0, marginBottom: '1rem', color: '#1f2937' }}>💳 Répartition par moyen de paiement</h3>
          {Object.keys(paymentStats).length === 0 ? (
            <p style={{ color: '#6b7280' }}>Aucune vente aujourd'hui.</p>
          ) : (
            <div>
              {Object.entries(paymentStats).map(([pm, value]) => {
                const total = Object.values(paymentStats).reduce((a, b) => a + b, 0);
                const percent = (value / total) * 100;
                return (
                  <div key={pm} style={{ marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: '#1f2937' }}>
                      <span>{paymentLabel(pm)}</span>
                      <span>{value.toFixed(0)} FC ({percent.toFixed(0)}%)</span>
                    </div>
                    <div style={{ width: '100%', height: '8px', background: '#e5e7eb', borderRadius: '4px', marginTop: '0.2rem' }}>
                      <div style={{ width: `${percent}%`, height: '100%', background: paymentColor(pm), borderRadius: '4px' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ===== Alertes stock bas ===== */}
      <div style={{ background: 'white', padding: '1.5rem', borderRadius: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', marginBottom: '2rem' }}>
        <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#1f2937' }}>
          ⚠️ Alertes de stock bas
        </h3>
        {stockAlerts.length === 0 ? (
          <p style={{ color: ACCENT }}>✅ Aucun médicament sous le seuil critique.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
            <thead>
              <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
                <th style={{ padding: '0.75rem', color: '#1f2937' }}>Médicament</th>
                <th style={{ padding: '0.75rem', color: '#1f2937' }}>DCI</th>
                <th style={{ padding: '0.75rem', color: '#1f2937' }}>Stock actuel</th>
                <th style={{ padding: '0.75rem', color: '#1f2937' }}>Seuil</th>
              </tr>
            </thead>
            <tbody>
              {stockAlerts.map((p) => (
                <tr key={p.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '0.75rem', color: '#1f2937', fontWeight: 'bold' }}>{p.name}</td>
                  <td style={{ padding: '0.75rem', color: '#6b7280' }}>{p.dci || '-'}</td>
                  <td style={{ padding: '0.75rem', color: DANGER, fontWeight: 'bold' }}>{p.current_stock}</td>
                  <td style={{ padding: '0.75rem', color: '#1f2937' }}>{p.reorder_level}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ===== Alertes péremption ===== */}
      <div style={{ background: 'white', padding: '1.5rem', borderRadius: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', marginBottom: '2rem' }}>
        <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#1f2937' }}>
          ⏰ Alertes de péremption (≤ 30 jours)
        </h3>
        {peremptionAlerts.length === 0 ? (
          <p style={{ color: ACCENT }}>✅ Aucun médicament proche de la péremption.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
            <thead>
              <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
                <th style={{ padding: '0.75rem', color: '#1f2937' }}>Médicament</th>
                <th style={{ padding: '0.75rem', color: '#1f2937' }}>Lot</th>
                <th style={{ padding: '0.75rem', color: '#1f2937' }}>Stock</th>
                <th style={{ padding: '0.75rem', color: '#1f2937' }}>Date de péremption</th>
                <th style={{ padding: '0.75rem', color: '#1f2937' }}>Statut</th>
              </tr>
            </thead>
            <tbody>
              {peremptionAlerts.map((p) => {
                let badge, color;
                if (p.diffDays < 0) { badge = 'EXPIRÉ'; color = DANGER; }
                else if (p.diffDays <= 7) { badge = `${p.diffDays}j`; color = DANGER; }
                else { badge = `${p.diffDays}j`; color = WARN; }
                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '0.75rem', color: '#1f2937', fontWeight: 'bold' }}>{p.name}</td>
                    <td style={{ padding: '0.75rem', color: '#6b7280' }}>{p.lot || '-'}</td>
                    <td style={{ padding: '0.75rem', color: '#1f2937' }}>{p.current_stock}</td>
                    <td style={{ padding: '0.75rem', color: '#1f2937' }}>{new Date(p.date_peremption).toLocaleDateString('fr-FR')}</td>
                    <td style={{ padding: '0.75rem' }}>
                      <span style={{ background: color, color: 'white', padding: '0.2rem 0.6rem', borderRadius: '0.3rem', fontSize: '0.75rem', fontWeight: 'bold' }}>
                        {badge}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ===== Stock détaillé ===== */}
      <div style={{ background: 'white', padding: '1.5rem', borderRadius: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <h3 style={{ marginTop: 0, color: '#1f2937' }}>📦 Stock détaillé des médicaments</h3>
        {allProducts.length === 0 ? (
          <p style={{ color: '#6b7280' }}>Aucun médicament enregistré.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
                  <th style={{ padding: '0.5rem', color: '#1f2937' }}>Médicament</th>
                  <th style={{ padding: '0.5rem', color: '#1f2937' }}>DCI</th>
                  <th style={{ padding: '0.5rem', color: '#1f2937' }}>Dosage</th>
                  <th style={{ padding: '0.5rem', color: '#1f2937' }}>Forme</th>
                  <th style={{ padding: '0.5rem', textAlign: 'center', color: '#1f2937' }}>Stock</th>
                  <th style={{ padding: '0.5rem', textAlign: 'center', color: '#1f2937' }}>Seuil</th>
                  <th style={{ padding: '0.5rem', textAlign: 'center', color: '#1f2937' }}>Prix vente</th>
                  <th style={{ padding: '0.5rem', textAlign: 'center', color: '#1f2937' }}>Péremption</th>
                </tr>
              </thead>
              <tbody>
                {allProducts.map((p) => {
                  const stockBas = (p.current_stock || 0) <= (p.reorder_level || 0);
                  let peremptionColor = '#1f2937';
                  let peremptionLabel = '-';
                  if (p.date_peremption) {
                    const exp = new Date(p.date_peremption);
                    const diffDays = Math.floor((exp - new Date()) / (24 * 3600 * 1000));
                    peremptionLabel = exp.toLocaleDateString('fr-FR');
                    if (diffDays < 0) peremptionColor = DANGER;
                    else if (diffDays <= 30) peremptionColor = WARN;
                  }
                  return (
                    <tr key={p.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '0.5rem', color: '#1f2937', fontWeight: 'bold' }}>{p.name}</td>
                      <td style={{ padding: '0.5rem', color: '#6b7280' }}>{p.dci || '-'}</td>
                      <td style={{ padding: '0.5rem', color: '#6b7280' }}>{p.dosage || '-'}</td>
                      <td style={{ padding: '0.5rem', color: '#6b7280' }}>{p.forme || '-'}</td>
                      <td style={{ padding: '0.5rem', textAlign: 'center', color: stockBas ? DANGER : '#1f2937', fontWeight: stockBas ? 'bold' : 'normal' }}>
                        {p.current_stock || 0}
                      </td>
                      <td style={{ padding: '0.5rem', textAlign: 'center', color: '#1f2937' }}>{p.reorder_level || 0}</td>
                      <td style={{ padding: '0.5rem', textAlign: 'center', color: '#1f2937' }}>{(p.unit_price || 0).toFixed(0)} FC</td>
                      <td style={{ padding: '0.5rem', textAlign: 'center', color: peremptionColor, fontWeight: peremptionColor !== '#1f2937' ? 'bold' : 'normal' }}>
                        {peremptionLabel}
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

export default Dashboard;