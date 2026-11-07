import { useEffect, useState } from 'react';
import db from '../db';
import { syncAll } from '../services/syncService';

const PRIMARY = '#065f46';
const ACCENT = '#10b981';
const WARN = '#f59e0b';
const DANGER = '#dc2626';

const Rapports = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [period, setPeriod] = useState('daily');
  const [dateRange, setDateRange] = useState({
    start: new Date().toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0],
  });

  // Données agrégées
  const [kpis, setKpis] = useState({
    ca: 0,
    nbVentes: 0,
    panierMoyen: 0,
    margeTotale: 0,
    stockValeurAchat: 0,
    stockValeurVente: 0,
  });

  const [salesByPayment, setSalesByPayment] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [expiryAlerts, setExpiryAlerts] = useState([]);
  const [stockAlerts, setStockAlerts] = useState([]);
  const [dailyStock, setDailyStock] = useState([]);

  useEffect(() => {
    fetchAllData();
  }, [dateRange, period]);

  const fetchAllData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Lecture des données locales
      const [products, stockMovements, sales] = await Promise.all([
        db.products.toArray(),
        db.stockMovements.toArray(),
        db.sales.toArray(),
      ]);

      const startDate = new Date(dateRange.start);
      const endDate = new Date(dateRange.end);
      endDate.setHours(23, 59, 59, 999);

      // ===== Filtrer ventes et mouvements sur la période =====
      const periodSales = (sales || []).filter(s => {
        const d = new Date(s.sale_date);
        return d >= startDate && d <= endDate;
      });

      const periodMovements = (stockMovements || []).filter(m => {
        const d = new Date(m.created_at || m.date);
        return d >= startDate && d <= endDate;
      });

      // ===== KPI 1 : CA et nb ventes =====
      const ca = periodSales.reduce((sum, s) => sum + (parseFloat(s.total_amount) || 0), 0);
      const nbVentes = periodSales.length;
      const panierMoyen = nbVentes > 0 ? ca / nbVentes : 0;

      // ===== KPI 2 : Valeur du stock et marge =====
      const stockValeurAchat = (products || []).reduce(
        (sum, p) => sum + (p.current_stock || 0) * (parseFloat(p.prix_achat) || 0),
        0
      );
      const stockValeurVente = (products || []).reduce(
        (sum, p) => sum + (p.current_stock || 0) * (parseFloat(p.unit_price) || 0),
        0
      );
      const margeTotale = stockValeurVente - stockValeurAchat;

      setKpis({ ca, nbVentes, panierMoyen, margeTotale, stockValeurAchat, stockValeurVente });

      // ===== Répartition par moyen de paiement =====
      const paymentMap = {};
      periodSales.forEach(s => {
        const key = s.payment_method || 'cash';
        paymentMap[key] = (paymentMap[key] || 0) + (parseFloat(s.total_amount) || 0);
      });
      const paymentList = Object.entries(paymentMap)
        .map(([name, amount]) => ({ name, amount }))
        .sort((a, b) => b.amount - a.amount);
      setSalesByPayment(paymentList);

      // ===== Top médicaments vendus =====
      const productSalesMap = {};
      periodMovements.forEach(m => {
        if (m.movement_type === 'retail_sale') {
          const pid = m.product_id;
          const qty = Math.abs(m.quantity_change);
          const prod = (products || []).find(p => p.id === pid);
          const unitPrice = parseFloat(prod?.unit_price) || 0;
          if (!productSalesMap[pid]) {
            productSalesMap[pid] = {
              id: pid,
              name: prod?.name || 'Inconnu',
              dci: prod?.dci || '',
              qty: 0,
              amount: 0,
            };
          }
          productSalesMap[pid].qty += qty;
          productSalesMap[pid].amount += qty * unitPrice;
        }
      });
      setTopProducts(
        Object.values(productSalesMap)
          .sort((a, b) => b.qty - a.qty)
          .slice(0, 15)
      );

      // ===== Alertes péremption (indépendant de la période) =====
      const now = new Date();
      const expiryList = (products || [])
        .filter(p => p.date_peremption)
        .map(p => {
          const exp = new Date(p.date_peremption);
          const diffDays = Math.floor((exp - now) / (24 * 3600 * 1000));
          return { ...p, diffDays };
        })
        .filter(p => p.diffDays <= 90)
        .sort((a, b) => a.diffDays - b.diffDays);
      setExpiryAlerts(expiryList);

      // ===== Alertes stock bas =====
      const stockBas = (products || [])
        .filter(p => (p.current_stock || 0) <= (p.reorder_level || 0))
        .sort((a, b) => (a.current_stock || 0) - (b.current_stock || 0));
      setStockAlerts(stockBas);

      // ===== Suivi des stocks par produit (période) =====
      const productStats = {};
      (products || []).forEach(p => {
        productStats[p.id] = {
          id: p.id,
          name: p.name,
          dci: p.dci,
          current_stock: p.current_stock || 0,
          reorder_level: p.reorder_level || 0,
          entries: 0,
          exits: 0,
        };
      });

      periodMovements.forEach(m => {
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

      const dailyResult = Object.values(productStats)
        .filter(p => p.entries > 0 || p.exits > 0)
        .map(p => ({
          ...p,
          initialStock: Math.max(p.current_stock - p.entries + p.exits, 0),
          finalStock: p.current_stock,
        }))
        .sort((a, b) => (b.entries + b.exits) - (a.entries + a.exits))
        .slice(0, 30);

      setDailyStock(dailyResult);

      // Synchronisation en arrière-plan
      if (navigator.onLine) {
        try { await syncAll(); } catch (e) { console.warn('Sync:', e); }
      }
    } catch (err) {
      console.error(err);
      setError('Erreur de chargement des données : ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDateChange = (e) => {
    const { name, value } = e.target;
    setDateRange(prev => ({ ...prev, [name]: value }));
  };

  const handlePeriodChange = (p) => {
    setPeriod(p);
    const now = new Date();
    let start = new Date();
    let end = new Date();

    if (p === 'daily') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (p === 'weekly') {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      start = new Date(now.getFullYear(), now.getMonth(), diff);
      end = new Date(now.getFullYear(), now.getMonth(), diff + 6);
    } else if (p === 'monthly') {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    }

    setDateRange({
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0],
    });
  };

  const paymentLabel = (pm) => {
    switch (pm) {
      case 'cash': return '💵 Espèces';
      case 'bank': return '🏦 Banque';
      case 'mobile_money': return '📱 Mobile money';
      case 'assurance': return '🏥 Assurance';
      case 'credit': return '📝 Crédit';
      default: return pm;
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

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
        <div style={{ fontSize: '1.5rem', color: ACCENT }}>Chargement des rapports...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '2rem', color: DANGER }}>
        <h1>Erreur</h1>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', paddingTop: '90px', maxWidth: '1300px', margin: '0 auto' }}>
      {/* En-tête */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ color: PRIMARY, fontSize: '2rem', marginBottom: '0.5rem' }}>📊 Rapports & Statistiques</h1>
        <p style={{ color: '#4b5563', fontSize: '1rem', marginTop: 0 }}>
          Bilans de la pharmacie : CA, ventes, stock, péremptions, alertes
        </p>
      </div>

      {/* Sélecteur période */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {[
            { key: 'daily', label: 'Jour' },
            { key: 'weekly', label: 'Semaine' },
            { key: 'monthly', label: 'Mois' },
          ].map(p => (
            <button
              key={p.key}
              onClick={() => handlePeriodChange(p.key)}
              style={{
                padding: '0.4rem 1rem',
                background: period === p.key ? PRIMARY : '#e5e7eb',
                color: period === p.key ? 'white' : '#1f2937',
                border: 'none',
                borderRadius: '0.3rem',
                cursor: 'pointer',
                fontWeight: period === p.key ? 'bold' : 'normal',
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontWeight: 'bold' }}>Du</label>
          <input
            type="date"
            name="start"
            value={dateRange.start}
            onChange={handleDateChange}
            style={{ padding: '0.3rem', borderRadius: '0.3rem', border: '1px solid #d1d5db' }}
          />
          <label style={{ fontWeight: 'bold' }}>Au</label>
          <input
            type="date"
            name="end"
            value={dateRange.end}
            onChange={handleDateChange}
            style={{ padding: '0.3rem', borderRadius: '0.3rem', border: '1px solid #d1d5db' }}
          />
          <button
            onClick={fetchAllData}
            style={{ padding: '0.4rem 1rem', background: ACCENT, color: 'white', border: 'none', borderRadius: '0.3rem', cursor: 'pointer', fontWeight: 'bold' }}
          >
            🔄 Appliquer
          </button>
        </div>
      </div>

      {/* ===== KPI CARDS ===== */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <div style={{ background: 'white', padding: '1rem', borderRadius: '0.75rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', borderLeft: `4px solid ${ACCENT}` }}>
          <p style={{ margin: 0, color: '#6b7280', fontSize: '0.8rem' }}>Chiffre d'affaires</p>
          <p style={{ fontSize: '1.6rem', fontWeight: 'bold', margin: '0.2rem 0', color: PRIMARY }}>
            {kpis.ca.toFixed(0)} FC
          </p>
          <small style={{ color: '#6b7280' }}>{kpis.nbVentes} vente(s)</small>
        </div>
        <div style={{ background: 'white', padding: '1rem', borderRadius: '0.75rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', borderLeft: `4px solid #3b82f6` }}>
          <p style={{ margin: 0, color: '#6b7280', fontSize: '0.8rem' }}>Panier moyen</p>
          <p style={{ fontSize: '1.6rem', fontWeight: 'bold', margin: '0.2rem 0', color: PRIMARY }}>
            {kpis.panierMoyen.toFixed(0)} FC
          </p>
          <small style={{ color: '#6b7280' }}>Par transaction</small>
        </div>
        <div style={{ background: 'white', padding: '1rem', borderRadius: '0.75rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', borderLeft: `4px solid #8b5cf6` }}>
          <p style={{ margin: 0, color: '#6b7280', fontSize: '0.8rem' }}>Valeur du stock (achat)</p>
          <p style={{ fontSize: '1.6rem', fontWeight: 'bold', margin: '0.2rem 0', color: PRIMARY }}>
            {kpis.stockValeurAchat.toFixed(0)} FC
          </p>
          <small style={{ color: '#6b7280' }}>Investissement</small>
        </div>
        <div style={{ background: 'white', padding: '1rem', borderRadius: '0.75rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', borderLeft: `4px solid ${WARN}` }}>
          <p style={{ margin: 0, color: '#6b7280', fontSize: '0.8rem' }}>Marge potentielle</p>
          <p style={{ fontSize: '1.6rem', fontWeight: 'bold', margin: '0.2rem 0', color: ACCENT }}>
            {kpis.margeTotale.toFixed(0)} FC
          </p>
          <small style={{ color: '#6b7280' }}>Stock × marge</small>
        </div>
      </div>

      {/* ===== Top produits + Paiements ===== */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        <div style={{ background: 'white', padding: '1rem', borderRadius: '0.75rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <h3 style={{ marginTop: 0, color: PRIMARY }}>🏆 Top médicaments vendus</h3>
          {topProducts.length === 0 ? (
            <p style={{ color: '#6b7280' }}>Aucune vente sur cette période.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
                    <th style={{ padding: '0.4rem' }}>#</th>
                    <th style={{ padding: '0.4rem' }}>Médicament</th>
                    <th style={{ padding: '0.4rem', textAlign: 'right' }}>Qté</th>
                    <th style={{ padding: '0.4rem', textAlign: 'right' }}>CA (FC)</th>
                  </tr>
                </thead>
                <tbody>
                  {topProducts.map((p, idx) => (
                    <tr key={p.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '0.4rem', color: '#6b7280' }}>{idx + 1}</td>
                      <td style={{ padding: '0.4rem' }}>
                        <strong>{p.name}</strong>
                        {p.dci && <small style={{ color: '#6b7280' }}> — {p.dci}</small>}
                      </td>
                      <td style={{ padding: '0.4rem', textAlign: 'right', fontWeight: 'bold' }}>{p.qty}</td>
                      <td style={{ padding: '0.4rem', textAlign: 'right', color: PRIMARY, fontWeight: 'bold' }}>{p.amount.toFixed(0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div style={{ background: 'white', padding: '1rem', borderRadius: '0.75rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <h3 style={{ marginTop: 0, color: PRIMARY }}>💳 Répartition par moyen de paiement</h3>
          {salesByPayment.length === 0 ? (
            <p style={{ color: '#6b7280' }}>Aucune vente sur cette période.</p>
          ) : (
            <div>
              {salesByPayment.map((pm, idx) => {
                const total = salesByPayment.reduce((s, p) => s + p.amount, 0);
                const percent = total > 0 ? (pm.amount / total) * 100 : 0;
                return (
                  <div key={idx} style={{ marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                      <span style={{ fontWeight: 'bold' }}>{paymentLabel(pm.name)}</span>
                      <span>{pm.amount.toFixed(0)} FC ({percent.toFixed(0)}%)</span>
                    </div>
                    <div style={{ width: '100%', height: '8px', background: '#e5e7eb', borderRadius: '4px', marginTop: '0.25rem' }}>
                      <div style={{ width: `${percent}%`, height: '100%', background: paymentColor(pm.name), borderRadius: '4px' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ===== Alertes péremption ===== */}
      <div style={{ background: 'white', padding: '1rem', borderRadius: '0.75rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', marginBottom: '2rem' }}>
        <h3 style={{ marginTop: 0, color: DANGER }}>⏰ Alertes de péremption (≤ 90 jours)</h3>
        {expiryAlerts.length === 0 ? (
          <p style={{ color: ACCENT }}>✅ Aucun médicament proche de la péremption.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ background: '#fef2f2', textAlign: 'left' }}>
                  <th style={{ padding: '0.4rem' }}>Médicament</th>
                  <th style={{ padding: '0.4rem' }}>DCI</th>
                  <th style={{ padding: '0.4rem' }}>Lot</th>
                  <th style={{ padding: '0.4rem', textAlign: 'center' }}>Stock</th>
                  <th style={{ padding: '0.4rem', textAlign: 'center' }}>Péremption</th>
                  <th style={{ padding: '0.4rem', textAlign: 'center' }}>Statut</th>
                </tr>
              </thead>
              <tbody>
                {expiryAlerts.map(p => {
                  let badge, color;
                  if (p.diffDays < 0) { badge = 'EXPIRÉ'; color = DANGER; }
                  else if (p.diffDays <= 30) { badge = `${p.diffDays}j`; color = DANGER; }
                  else { badge = `${p.diffDays}j`; color = WARN; }
                  return (
                    <tr key={p.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '0.4rem', fontWeight: 'bold' }}>{p.name}</td>
                      <td style={{ padding: '0.4rem', color: '#6b7280' }}>{p.dci || '-'}</td>
                      <td style={{ padding: '0.4rem', fontFamily: 'monospace', fontSize: '0.8rem' }}>{p.lot || '-'}</td>
                      <td style={{ padding: '0.4rem', textAlign: 'center' }}>{p.current_stock || 0}</td>
                      <td style={{ padding: '0.4rem', textAlign: 'center' }}>{new Date(p.date_peremption).toLocaleDateString('fr-FR')}</td>
                      <td style={{ padding: '0.4rem', textAlign: 'center' }}>
                        <span style={{ background: color, color: 'white', padding: '0.2rem 0.6rem', borderRadius: '0.3rem', fontSize: '0.75rem', fontWeight: 'bold' }}>
                          {badge}
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

      {/* ===== Alertes stock bas ===== */}
      <div style={{ background: 'white', padding: '1rem', borderRadius: '0.75rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', marginBottom: '2rem' }}>
        <h3 style={{ marginTop: 0, color: WARN }}>⚠️ Alertes de stock bas</h3>
        {stockAlerts.length === 0 ? (
          <p style={{ color: ACCENT }}>✅ Aucun médicament sous le seuil critique.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ background: '#fffbeb', textAlign: 'left' }}>
                  <th style={{ padding: '0.4rem' }}>Médicament</th>
                  <th style={{ padding: '0.4rem' }}>DCI</th>
                  <th style={{ padding: '0.4rem', textAlign: 'center' }}>Stock</th>
                  <th style={{ padding: '0.4rem', textAlign: 'center' }}>Seuil</th>
                  <th style={{ padding: '0.4rem', textAlign: 'center' }}>Manque</th>
                </tr>
              </thead>
              <tbody>
                {stockAlerts.map(p => {
                  const manque = (p.reorder_level || 0) - (p.current_stock || 0);
                  return (
                    <tr key={p.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '0.4rem', fontWeight: 'bold' }}>{p.name}</td>
                      <td style={{ padding: '0.4rem', color: '#6b7280' }}>{p.dci || '-'}</td>
                      <td style={{ padding: '0.4rem', textAlign: 'center', color: p.current_stock === 0 ? DANGER : WARN, fontWeight: 'bold' }}>
                        {p.current_stock || 0}
                      </td>
                      <td style={{ padding: '0.4rem', textAlign: 'center' }}>{p.reorder_level || 0}</td>
                      <td style={{ padding: '0.4rem', textAlign: 'center', color: DANGER, fontWeight: 'bold' }}>+{manque}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ===== Suivi des stocks sur la période ===== */}
      <div style={{ background: 'white', padding: '1rem', borderRadius: '0.75rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <h3 style={{ marginTop: 0, color: PRIMARY }}>📦 Suivi des stocks sur la période</h3>
        {dailyStock.length === 0 ? (
          <p style={{ color: '#6b7280' }}>Aucun mouvement de stock sur cette période.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
                  <th style={{ padding: '0.4rem' }}>Médicament</th>
                  <th style={{ padding: '0.4rem', textAlign: 'center' }}>Stock initial</th>
                  <th style={{ padding: '0.4rem', textAlign: 'center', color: ACCENT }}>Entrées</th>
                  <th style={{ padding: '0.4rem', textAlign: 'center', color: DANGER }}>Sorties</th>
                  <th style={{ padding: '0.4rem', textAlign: 'center' }}>Stock final</th>
                  <th style={{ padding: '0.4rem', textAlign: 'center' }}>Seuil</th>
                </tr>
              </thead>
              <tbody>
                {dailyStock.map(item => (
                  <tr key={item.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '0.4rem', fontWeight: 'bold' }}>{item.name}</td>
                    <td style={{ padding: '0.4rem', textAlign: 'center' }}>{item.initialStock}</td>
                    <td style={{ padding: '0.4rem', textAlign: 'center', color: ACCENT, fontWeight: 'bold' }}>
                      {item.entries > 0 ? `+${item.entries}` : '-'}
                    </td>
                    <td style={{ padding: '0.4rem', textAlign: 'center', color: DANGER, fontWeight: 'bold' }}>
                      {item.exits > 0 ? `-${item.exits}` : '-'}
                    </td>
                    <td style={{ padding: '0.4rem', textAlign: 'center', fontWeight: 'bold', color: item.finalStock <= item.reorder_level ? DANGER : PRIMARY }}>
                      {item.finalStock}
                    </td>
                    <td style={{ padding: '0.4rem', textAlign: 'center', color: '#6b7280' }}>{item.reorder_level}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Rapports;