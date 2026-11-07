import { useEffect, useState } from 'react';
import db from '../db';
import { syncAll } from '../services/syncService';

const PRIMARY = '#065f46';
const ACCENT = '#10b981';
const DANGER = '#dc2626';

const Mouvements = () => {
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [movs, prods] = await Promise.all([db.stockMovements.toArray(), db.products.toArray()]);
      const prodMap = {};
      prods.forEach(p => prodMap[p.id] = p);
      
      const enriched = movs.map(m => ({
        ...m,
        productName: prodMap[m.product_id]?.name || 'Inconnu',
        dci: prodMap[m.product_id]?.dci || ''
      })).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      
      setMovements(enriched.slice(0, 100)); // 100 derniers
      setLoading(false);
    };
    load();
  }, []);

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Chargement...</div>;

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ color: PRIMARY, marginBottom: '0.5rem' }}>📋 Journal des Mouvements</h1>
      <p style={{ color: '#6b7280', marginBottom: '2rem' }}>Historique des 100 dernières entrées et sorties de stock</p>

      <div style={{ background: 'white', borderRadius: '1rem', padding: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
              <th style={{ padding: '0.75rem' }}>Date</th>
              <th style={{ padding: '0.75rem' }}>Médicament</th>
              <th style={{ padding: '0.75rem' }}>Type</th>
              <th style={{ padding: '0.75rem', textAlign: 'center' }}>Quantité</th>
              <th style={{ padding: '0.75rem' }}>Motif</th>
            </tr>
          </thead>
          <tbody>
            {movements.map(m => {
              const isEntry = m.movement_type === 'supplier_in' || m.movement_type === 'cooperant_return';
              return (
                <tr key={m.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '0.75rem' }}>{new Date(m.created_at).toLocaleString('fr-FR')}</td>
                  <td style={{ padding: '0.75rem', fontWeight: 'bold' }}>{m.productName}</td>
                  <td style={{ padding: '0.75rem' }}>
                    {m.movement_type === 'supplier_in' ? 'Entrée' : 
                     m.movement_type === 'retail_sale' ? 'Vente' : 
                     m.movement_type === 'stock_loss' ? 'Ajustement' : m.movement_type}
                  </td>
                  <td style={{ padding: '0.75rem', textAlign: 'center', fontWeight: 'bold', color: isEntry ? ACCENT : DANGER }}>
                    {isEntry ? '+' : '-'}{Math.abs(m.quantity_change)}
                  </td>
                  <td style={{ padding: '0.75rem', color: '#6b7280' }}>{m.reason || '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Mouvements;