import { useEffect, useState } from 'react';
import db from '../db';

const PRIMARY = '#065f46';
const DANGER = '#dc2626';
const WARN = '#f59e0b';

const AlertesStock = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const data = await db.products.toArray();
      const alerts = data
        .filter(p => (p.current_stock || 0) <= (p.reorder_level || 0))
        .sort((a, b) => (a.current_stock || 0) - (b.current_stock || 0));
      setProducts(alerts);
      setLoading(false);
    };
    load();
  }, []);

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Chargement...</div>;

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ color: WARN, marginBottom: '0.5rem' }}>⚠️ Alertes de Stock Bas</h1>
      <p style={{ color: '#6b7280', marginBottom: '2rem' }}>Médicaments à réapprovisionner de toute urgence</p>

      {products.length === 0 ? (
        <p style={{ color: PRIMARY }}>✅ Aucun médicament sous le seuil critique.</p>
      ) : (
        <div style={{ background: 'white', borderRadius: '1rem', padding: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#fffbeb', textAlign: 'left' }}>
                <th style={{ padding: '0.75rem' }}>Médicament</th>
                <th style={{ padding: '0.75rem' }}>DCI</th>
                <th style={{ padding: '0.75rem', textAlign: 'center' }}>Stock</th>
                <th style={{ padding: '0.75rem', textAlign: 'center' }}>Seuil</th>
                <th style={{ padding: '0.75rem', textAlign: 'center' }}>Manque</th>
              </tr>
            </thead>
            <tbody>
              {products.map(p => {
                const manque = (p.reorder_level || 0) - (p.current_stock || 0);
                const color = p.current_stock === 0 ? DANGER : WARN;
                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '0.75rem', fontWeight: 'bold' }}>{p.name}</td>
                    <td style={{ padding: '0.75rem', color: '#6b7280' }}>{p.dci || '-'}</td>
                    <td style={{ padding: '0.75rem', textAlign: 'center', color, fontWeight: 'bold' }}>{p.current_stock}</td>
                    <td style={{ padding: '0.75rem', textAlign: 'center' }}>{p.reorder_level}</td>
                    <td style={{ padding: '0.75rem', textAlign: 'center', color: DANGER, fontWeight: 'bold' }}>+{manque}</td>
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
export default AlertesStock;