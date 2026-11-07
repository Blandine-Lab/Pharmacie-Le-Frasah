import { useEffect, useState } from 'react';
import db from '../db';
import { syncAll } from '../services/syncService';

const PRIMARY = '#065f46';
const DANGER = '#dc2626';
const WARN = '#f59e0b';

const AlertesPeremption = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const data = await db.products.toArray();
      const now = new Date();
      const alerts = data
        .filter(p => p.date_peremption)
        .map(p => {
          const exp = new Date(p.date_peremption);
          const diffDays = Math.floor((exp - now) / (24 * 3600 * 1000));
          return { ...p, diffDays };
        })
        .filter(p => p.diffDays <= 90)
        .sort((a, b) => a.diffDays - b.diffDays);
      setProducts(alerts);
      setLoading(false);
    };
    load();
  }, []);

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Chargement...</div>;

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ color: DANGER, marginBottom: '0.5rem' }}>⏰ Alertes de Péremption</h1>
      <p style={{ color: '#6b7280', marginBottom: '2rem' }}>Médicaments expirant dans les 90 prochains jours</p>

      {products.length === 0 ? (
        <p style={{ color: PRIMARY }}>✅ Aucun médicament proche de la péremption.</p>
      ) : (
        <div style={{ background: 'white', borderRadius: '1rem', padding: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#fef2f2', textAlign: 'left' }}>
                <th style={{ padding: '0.75rem' }}>Médicament</th>
                <th style={{ padding: '0.75rem' }}>Lot</th>
                <th style={{ padding: '0.75rem', textAlign: 'center' }}>Stock</th>
                <th style={{ padding: '0.75rem', textAlign: 'center' }}>Péremption</th>
                <th style={{ padding: '0.75rem', textAlign: 'center' }}>Statut</th>
              </tr>
            </thead>
            <tbody>
              {products.map(p => {
                let badge, color;
                if (p.diffDays < 0) { badge = 'EXPIRÉ'; color = DANGER; }
                else if (p.diffDays <= 30) { badge = `URGENT (${p.diffDays}j)`; color = DANGER; }
                else { badge = `${p.diffDays}j`; color = WARN; }
                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '0.75rem', fontWeight: 'bold' }}>{p.name}</td>
                    <td style={{ padding: '0.75rem', fontFamily: 'monospace' }}>{p.lot || '-'}</td>
                    <td style={{ padding: '0.75rem', textAlign: 'center', fontWeight: 'bold' }}>{p.current_stock}</td>
                    <td style={{ padding: '0.75rem', textAlign: 'center' }}>{new Date(p.date_peremption).toLocaleDateString('fr-FR')}</td>
                    <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                      <span style={{ background: color, color: 'white', padding: '0.2rem 0.6rem', borderRadius: '0.3rem', fontSize: '0.8rem', fontWeight: 'bold' }}>
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
  );
};
export default AlertesPeremption;