import { useEffect, useState } from 'react';
import db from '../db';
import api from '../services/api';
import { syncAll } from '../services/syncService';

const PRIMARY = '#065f46';
const ACCENT = '#10b981';
const DANGER = '#dc2626';
const WARN = '#f59e0b';

const RetoursClients = () => {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // États pour le modal
  const [showModal, setShowModal] = useState(false);
  const [selectedSale, setSelectedSale] = useState(null);
  const [saleItems, setSaleItems] = useState([]);
  const [returnQtys, setReturnQtys] = useState({});
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    fetchSales();
  }, []);

  const fetchSales = async () => {
    try {
      const data = await db.sales.toArray();
      setSales(data.sort((a, b) => new Date(b.sale_date) - new Date(a.sale_date)).slice(0, 50));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Ouvre le modal et charge les produits de la vente
  const handleOpenReturnModal = async (sale) => {
    setSelectedSale(sale);
    
    // Récupérer les mouvements liés à cette vente
    const movements = await db.stockMovements.toArray();
    const items = movements.filter(m => m.reference_id === sale.id && m.movement_type === 'retail_sale');
    
    // Récupérer les noms des produits
    const products = await db.products.toArray();
    const prodMap = {};
    products.forEach(p => prodMap[p.id] = p);

    const enrichedItems = items.map(item => ({
      ...item,
      product: prodMap[item.product_id]
    }));

    setSaleItems(enrichedItems);
    
    // Initialiser les quantités à retourner (0 par défaut)
    const initialQtys = {};
    enrichedItems.forEach(item => {
      initialQtys[item.id] = 0;
    });
    setReturnQtys(initialQtys);
    setShowModal(true);
  };

  const handleQtyChange = (movementId, val, maxQty) => {
    const qty = parseInt(val) || 0;
    if (qty > maxQty) {
      alert(`Vous ne pouvez pas retourner plus de ${maxQty} unités.`);
      setReturnQtys({ ...returnQtys, [movementId]: maxQty });
    } else if (qty < 0) {
      setReturnQtys({ ...returnQtys, [movementId]: 0 });
    } else {
      setReturnQtys({ ...returnQtys, [movementId]: qty });
    }
  };

  const handleConfirmReturn = async () => {
    // Vérifier qu'au moins un produit est retourné
    const hasReturns = Object.values(returnQtys).some(qty => qty > 0);
    if (!hasReturns) {
      alert("Veuillez sélectionner au moins une quantité à retourner.");
      return;
    }

    setProcessing(true);
    try {
      // Pour chaque produit retourné, on enregistre un mouvement d'entrée
      for (const item of saleItems) {
        const qtyToReturn = returnQtys[item.id];
        if (qtyToReturn > 0) {
          await api.post('/movement', {
            product_id: item.product_id,
            quantity: qtyToReturn,
            movement_type: 'cooperant_return', // Utilisé pour l'ajout en stock (ou 'supplier_in')
            cooperant_id: null,
            reference_id: selectedSale.id,
            reason: `Retour client - Vente du ${new Date(selectedSale.sale_date).toLocaleDateString('fr-FR')}`
          });
        }
      }

      await syncAll();
      await fetchSales();
      
      alert("✅ Retour enregistré avec succès. Le stock a été mis à jour.");
      setShowModal(false);
    } catch (error) {
      console.error(error);
      alert("❌ Erreur lors de l'enregistrement du retour.");
    } finally {
      setProcessing(false);
    }
  };

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Chargement...</div>;

  return (
    <>
      <div className="no-print" style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
        <h1 style={{ color: PRIMARY, marginBottom: '0.5rem' }}>🔄 Retours Clients</h1>
        <p style={{ color: '#6b7280', marginBottom: '2rem' }}>
          Sélectionnez une vente récente pour enregistrer un retour et ré-incrémenter le stock.
        </p>

        <div style={{ background: 'white', borderRadius: '1rem', padding: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
                <th style={{ padding: '0.75rem' }}>Date</th>
                <th style={{ padding: '0.75rem' }}>Montant</th>
                <th style={{ padding: '0.75rem' }}>Paiement</th>
                <th style={{ padding: '0.75rem' }}>Note</th>
                <th style={{ padding: '0.75rem', textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {sales.length === 0 ? (
                <tr><td colSpan="5" style={{ padding: '1rem', textAlign: 'center', color: '#6b7280' }}>Aucune vente récente.</td></tr>
              ) : sales.map(s => (
                <tr key={s.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '0.75rem' }}>{new Date(s.sale_date).toLocaleString('fr-FR')}</td>
                  <td style={{ padding: '0.75rem', fontWeight: 'bold' }}>{parseFloat(s.total_amount).toFixed(0)} FC</td>
                  <td style={{ padding: '0.75rem', textTransform: 'capitalize' }}>{s.payment_method}</td>
                  <td style={{ padding: '0.75rem', color: '#6b7280' }}>{s.note || '-'}</td>
                  <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                    <button 
                      onClick={() => handleOpenReturnModal(s)} 
                      style={{ background: '#fef2f2', color: DANGER, border: `1px solid ${DANGER}`, padding: '0.3rem 0.6rem', borderRadius: '0.3rem', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}
                    >
                      ↩️ Retourner
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL DE RETOUR */}
      {showModal && selectedSale && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
          background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 3000
        }}>
          <div style={{ background: 'white', padding: '2rem', borderRadius: '1rem', maxWidth: '600px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ marginTop: 0, color: PRIMARY }}>↩️ Enregistrer un retour</h2>
            <p style={{ color: '#6b7280', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              Vente du {new Date(selectedSale.sale_date).toLocaleString('fr-FR')} — Total : <strong>{parseFloat(selectedSale.total_amount).toFixed(0)} FC</strong>
            </p>

            {saleItems.length === 0 ? (
              <p style={{ color: WARN }}>⚠️ Impossible de trouver les produits de cette vente (données manquantes).</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                <thead>
                  <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
                    <th style={{ padding: '0.5rem' }}>Médicament</th>
                    <th style={{ padding: '0.5rem', textAlign: 'center' }}>Acheté</th>
                    <th style={{ padding: '0.5rem', textAlign: 'center' }}>Qté à retourner</th>
                  </tr>
                </thead>
                <tbody>
                  {saleItems.map(item => {
                    const maxQty = Math.abs(item.quantity_change);
                    return (
                      <tr key={item.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                        <td style={{ padding: '0.5rem', fontWeight: 'bold' }}>
                          {item.product?.name || 'Inconnu'} <span style={{ color: '#6b7280', fontWeight: 'normal' }}>{item.product?.dci}</span>
                        </td>
                        <td style={{ padding: '0.5rem', textAlign: 'center' }}>{maxQty}</td>
                        <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                          <input
                            type="number"
                            min="0"
                            max={maxQty}
                            value={returnQtys[item.id] || 0}
                            onChange={(e) => handleQtyChange(item.id, e.target.value, maxQty)}
                            style={{ width: '70px', padding: '0.3rem', textAlign: 'center', borderRadius: '0.3rem', border: '1px solid #d1d5db' }}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowModal(false)}
                disabled={processing}
                style={{ padding: '0.5rem 1.5rem', background: '#9ca3af', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer' }}
              >
                Annuler
              </button>
              <button
                onClick={handleConfirmReturn}
                disabled={processing || saleItems.length === 0}
                style={{ padding: '0.5rem 1.5rem', background: ACCENT, color: 'white', border: 'none', borderRadius: '0.5rem', cursor: processing ? 'not-allowed' : 'pointer', fontWeight: 'bold', opacity: processing ? 0.7 : 1 }}
              >
                {processing ? 'Enregistrement...' : 'Confirmer le retour'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default RetoursClients;