import { useEffect, useState } from 'react';
import db from '../db';
import { supabase } from '../utils/supabaseClient';

const PRIMARY = '#065f46';
const ACCENT = '#10b981';
const WARN = '#f59e0b';
const DANGER = '#dc2626';

const Inventaire = () => {
  const [activeTab, setActiveTab] = useState('new'); // 'new' ou 'history'
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState({});
  const [saving, setSaving] = useState(false);
  const [signature, setSignature] = useState(localStorage.getItem('pharmacy_signature') || null);

  // État pour l'historique
  const [history, setHistory] = useState([]);
  const [selectedHistory, setSelectedHistory] = useState(null);

  // État pour les mouvements du jour
  const [todayMovements, setTodayMovements] = useState({ entries: [], exits: [] });

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      // 1. Charger les produits
      const allProducts = await db.products.toArray();
      setProducts(allProducts.sort((a, b) => a.name.localeCompare(b.name)));

      // 2. Charger l'historique
      const { data: histData } = await supabase
        .from('inventory_history')
        .select('*')
        .order('created_at', { ascending: false });
      setHistory(histData || []);

      // 3. Charger les mouvements du jour (pour justifier les écarts)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const movements = await db.stockMovements.toArray();
      const todayMovs = movements.filter(m => new Date(m.created_at) >= today);
      
      const entries = todayMovs.filter(m => m.movement_type === 'supplier_in' || m.movement_type === 'cooperant_return');
      const exits = todayMovs.filter(m => m.movement_type === 'retail_sale' || m.movement_type === 'stock_loss' || m.movement_type === 'cooperant_take');

      setTodayMovements({ entries, exits });
    } catch (err) {
      console.error(err);
      alert("Erreur de chargement des données");
    } finally {
      setLoading(false);
    }
  };

  const handleCountChange = (id, val) => {
    setCounts(prev => ({ ...prev, [id]: val }));
  };

  // Calcul de l'écart total
  const totalGap = products.reduce((acc, p) => {
    const physical = counts[p.id];
    if (physical !== undefined && physical !== '') {
      return acc + (parseInt(physical) - p.current_stock);
    }
    return acc;
  }, 0);

  // ===== SAUVEGARDER L'INVENTAIRE =====
  const handleSaveInventory = async () => {
    // Vérifier qu'au moins un produit a été compté
    const countedItems = Object.keys(counts).length;
    if (countedItems === 0) {
      alert("Veuillez saisir au moins un comptage physique avant de sauvegarder.");
      return;
    }

    setSaving(true);
    try {
      // Préparer les détails pour le JSON
      const details = products.map(p => {
        const physical = counts[p.id] !== undefined && counts[p.id] !== '' ? parseInt(counts[p.id]) : null;
        return {
          product_id: p.id,
          name: p.name,
          dci: p.dci,
          theoretical_stock: p.current_stock,
          physical_stock: physical,
          gap: physical !== null ? physical - p.current_stock : null
        };
      }).filter(d => d.physical_stock !== null); // Ne garder que les produits comptés

      const { error } = await supabase.from('inventory_history').insert([{
        items_counted: countedItems,
        total_gap: totalGap,
        details: details
      }]);

      if (error) throw error;

      alert("✅ Inventaire sauvegardé avec succès dans l'historique !");
      setCounts({}); // Vider les champs
      setActiveTab('history'); // Aller à l'historique
      fetchInitialData();
    } catch (err) {
      console.error(err);
      alert("❌ Erreur lors de la sauvegarde de l'inventaire.");
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Chargement...</div>;

  return (
    <>
      {/* ===== ÉCRAN NORMAL ===== */}
      <div className="no-print" style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ color: PRIMARY, margin: 0 }}>📦 Gestion de l'Inventaire</h1>
            <p style={{ color: '#6b7280', marginTop: '0.5rem', marginBottom: 0 }}>
              Comparez le stock théorique avec le comptage réel.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={handlePrint} style={{ background: '#3b82f6', color: 'white', padding: '0.6rem 1.5rem', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 'bold' }}>
              🖨️ Imprimer
            </button>
            <button onClick={handleSaveInventory} disabled={saving} style={{ background: ACCENT, color: 'white', padding: '0.6rem 1.5rem', border: 'none', borderRadius: '0.5rem', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>
              {saving ? '⏳ Sauvegarde...' : '💾 Valider & Sauvegarder'}
            </button>
          </div>
        </div>

        {/* Onglets */}
        <div style={{ display: 'flex', gap: '1rem', borderBottom: '2px solid #e5e7eb', marginBottom: '1.5rem' }}>
          <button onClick={() => { setActiveTab('new'); setSelectedHistory(null); }} style={{ padding: '0.75rem 1.5rem', borderWidth: '0 0 3px 0', borderStyle: 'solid', borderColor: activeTab === 'new' ? PRIMARY : 'transparent', background: 'transparent', color: activeTab === 'new' ? PRIMARY : '#6b7280', fontWeight: 'bold', cursor: 'pointer', fontSize: '1rem' }}>
            📝 Nouvel Inventaire
          </button>
          <button onClick={() => setActiveTab('history')} style={{ padding: '0.75rem 1.5rem', borderWidth: '0 0 3px 0', borderStyle: 'solid', borderColor: activeTab === 'history' ? PRIMARY : 'transparent', background: 'transparent', color: activeTab === 'history' ? PRIMARY : '#6b7280', fontWeight: 'bold', cursor: 'pointer', fontSize: '1rem' }}>
            📜 Historique des Inventaires
          </button>
        </div>

        {/* ===== ONGLET : NOUVEL INVENTAIRE ===== */}
        {activeTab === 'new' && (
          <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: '1.5rem' }}>
            
            {/* Tableau des produits */}
            <div style={{ background: 'white', borderRadius: '1rem', padding: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
                    <th style={{ padding: '0.75rem' }}>Médicament</th>
                    <th style={{ padding: '0.75rem', textAlign: 'center' }}>Stock Système</th>
                    <th style={{ padding: '0.75rem', textAlign: 'center' }}>Comptage Réel</th>
                    <th style={{ padding: '0.75rem', textAlign: 'center' }}>Écart</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map(p => {
                    const physical = counts[p.id];
                    const ecart = physical !== undefined && physical !== '' ? parseInt(physical) - p.current_stock : null;
                    return (
                      <tr key={p.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                        <td style={{ padding: '0.75rem', fontWeight: 'bold' }}>{p.name} <span style={{ color: '#6b7280', fontSize: '0.8rem', fontWeight: 'normal' }}>{p.dci}</span></td>
                        <td style={{ padding: '0.75rem', textAlign: 'center' }}>{p.current_stock}</td>
                        <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                          <input type="number" value={counts[p.id] || ''} onChange={e => handleCountChange(p.id, e.target.value)} placeholder="-" style={{ width: '80px', padding: '0.4rem', textAlign: 'center', borderRadius: '0.3rem', border: '1px solid #d1d5db' }} />
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'center', fontWeight: 'bold', color: ecart === 0 ? ACCENT : ecart !== null ? WARN : '#9ca3af' }}>
                          {ecart !== null ? (ecart > 0 ? `+${ecart}` : ecart) : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Panneau latéral : Résumé */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ background: 'white', padding: '1.5rem', borderRadius: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                <h3 style={{ marginTop: 0, color: PRIMARY }}>📊 Résumé</h3>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid #e5e7eb' }}>
                  <span>Produits comptés :</span>
                  <strong>{Object.keys(counts).length} / {products.length}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid #e5e7eb' }}>
                  <span>Écart total :</span>
                  <strong style={{ color: totalGap === 0 ? ACCENT : totalGap > 0 ? WARN : DANGER }}>
                    {totalGap > 0 ? '+' : ''}{totalGap}
                  </strong>
                </div>
              </div>

              <div style={{ background: '#fffbeb', padding: '1rem', borderRadius: '1rem', borderLeft: `4px solid ${WARN}`, fontSize: '0.85rem' }}>
                <strong>💡 Rappel :</strong> N'oubliez pas de vérifier les <strong>Mouvements du Jour</strong> (ventes et entrées) pour justifier les écarts avant de sauvegarder.
              </div>
            </div>
          </div>
        )}

        {/* ===== ONGLET : HISTORIQUE ===== */}
        {activeTab === 'history' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.5rem' }}>
            {/* Liste de l'historique */}
            <div style={{ background: 'white', padding: '1rem', borderRadius: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
              <h3 style={{ marginTop: 0, color: PRIMARY }}>📜 Sessions passées</h3>
              {history.length === 0 ? <p style={{ color: '#6b7280' }}>Aucun historique.</p> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {history.map(h => (
                    <div 
                      key={h.id} 
                      onClick={() => setSelectedHistory(h)}
                      style={{ padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #e5e7eb', cursor: 'pointer', background: selectedHistory?.id === h.id ? '#f0fdf4' : 'white', borderLeft: selectedHistory?.id === h.id ? `4px solid ${ACCENT}` : '1px solid #e5e7eb' }}
                    >
                      <div style={{ fontWeight: 'bold', color: '#1f2937' }}>{new Date(h.created_at).toLocaleString('fr-FR')}</div>
                      <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.2rem' }}>
                        {h.items_counted} produits comptés | Écart: <strong style={{ color: h.total_gap === 0 ? ACCENT : DANGER }}>{h.total_gap > 0 ? '+' : ''}{h.total_gap}</strong>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Détails de l'historique sélectionné */}
            <div style={{ background: 'white', padding: '1.5rem', borderRadius: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
              {selectedHistory ? (
                <>
                  <h3 style={{ marginTop: 0, color: PRIMARY }}>Détails du {new Date(selectedHistory.created_at).toLocaleDateString('fr-FR')}</h3>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                    <thead>
                      <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
                        <th style={{ padding: '0.5rem' }}>Produit</th>
                        <th style={{ padding: '0.5rem', textAlign: 'center' }}>Stock Théorique</th>
                        <th style={{ padding: '0.5rem', textAlign: 'center' }}>Comptage Réel</th>
                        <th style={{ padding: '0.5rem', textAlign: 'center' }}>Écart</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedHistory.details.map((d, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #e5e7eb' }}>
                          <td style={{ padding: '0.5rem', fontWeight: 'bold' }}>{d.name} <span style={{ fontWeight: 'normal', color: '#6b7280', fontSize: '0.8rem' }}>{d.dci}</span></td>
                          <td style={{ padding: '0.5rem', textAlign: 'center' }}>{d.theoretical_stock}</td>
                          <td style={{ padding: '0.5rem', textAlign: 'center' }}>{d.physical_stock}</td>
                          <td style={{ padding: '0.5rem', textAlign: 'center', fontWeight: 'bold', color: d.gap === 0 ? ACCENT : WARN }}>{d.gap > 0 ? `+${d.gap}` : d.gap}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              ) : (
                <div style={{ textAlign: 'center', color: '#6b7280', padding: '3rem' }}>
                  Sélectionnez un inventaire dans la liste pour voir les détails.
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ===== ZONE D'IMPRESSION ===== */}
      <div className="print-area" style={{ display: 'none' }}>
        
        {/* En-tête */}
        <div style={{ textAlign: 'center', marginBottom: '20px', borderBottom: '2px solid #065f46', paddingBottom: '15px' }}>
          <img src="/logo.jpeg" alt="Logo" style={{ height: '70px', margin: '0 auto 10px', display: 'block', filter: 'grayscale(100%)' }} />
          <h1 style={{ margin: 0, fontSize: '22px', textTransform: 'uppercase', color: '#065f46' }}>Pharmacie Le Frasah</h1>
          <p style={{ margin: '5px 0', fontSize: '14px', fontWeight: 'bold' }}>Fiche d'Inventaire Physique</p>
          <p style={{ margin: 0, fontSize: '12px', color: '#555' }}>Généré le {new Date().toLocaleString('fr-FR')}</p>
        </div>

        {/* Résumé */}
        <div style={{ display: 'flex', justifyContent: 'space-between', backgroundColor: '#f3f4f6', padding: '10px', borderRadius: '5px', marginBottom: '20px', fontSize: '12px' }}>
          <div><strong>Produits comptés :</strong> {activeTab === 'new' ? Object.keys(counts).length : (selectedHistory ? selectedHistory.items_counted : 0)}</div>
          <div><strong>Écart Total :</strong> {activeTab === 'new' ? (totalGap > 0 ? `+${totalGap}` : totalGap) : (selectedHistory ? (selectedHistory.total_gap > 0 ? `+${selectedHistory.total_gap}` : selectedHistory.total_gap) : 0)}</div>
        </div>

        {/* Tableau Inventaire */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', marginBottom: '20px' }}>
          <thead>
            <tr>
              <th style={{ border: '1px solid #000', padding: '6px', textAlign: 'left', background: '#eee' }}>Médicament</th>
              <th style={{ border: '1px solid #000', padding: '6px', textAlign: 'center', background: '#eee' }}>Stock Théorique</th>
              <th style={{ border: '1px solid #000', padding: '6px', textAlign: 'center', background: '#eee' }}>Comptage Réel</th>
              <th style={{ border: '1px solid #000', padding: '6px', textAlign: 'center', background: '#eee' }}>Écart</th>
            </tr>
          </thead>
          <tbody>
            {activeTab === 'new' ? (
              products.filter(p => counts[p.id] !== undefined && counts[p.id] !== '').map(p => {
                const physical = parseInt(counts[p.id]);
                const ecart = physical - p.current_stock;
                return (
                  <tr key={p.id}>
                    <td style={{ border: '1px solid #000', padding: '6px', fontWeight: 'bold' }}>{p.name} {p.dci ? `(${p.dci})` : ''}</td>
                    <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'center' }}>{p.current_stock}</td>
                    <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'center' }}>{physical}</td>
                    <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'center', fontWeight: 'bold' }}>{ecart > 0 ? `+${ecart}` : ecart}</td>
                  </tr>
                );
              })
            ) : (
              selectedHistory && selectedHistory.details.map((d, i) => (
                <tr key={i}>
                  <td style={{ border: '1px solid #000', padding: '6px', fontWeight: 'bold' }}>{d.name} {d.dci ? `(${d.dci})` : ''}</td>
                  <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'center' }}>{d.theoretical_stock}</td>
                  <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'center' }}>{d.physical_stock}</td>
                  <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'center', fontWeight: 'bold' }}>{d.gap > 0 ? `+${d.gap}` : d.gap}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Mouvements du jour (pour justifier les écarts) */}
        {todayMovements.entries.length > 0 || todayMovements.exits.length > 0 ? (
          <>
            <h3 style={{ fontSize: '14px', marginBottom: '10px', borderBottom: '1px solid #000', paddingBottom: '4px' }}>Mouvements de stock du jour (Entrées / Sorties)</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px', marginBottom: '20px' }}>
              <thead>
                <tr>
                  <th style={{ border: '1px solid #000', padding: '4px', background: '#eee' }}>Type</th>
                  <th style={{ border: '1px solid #000', padding: '4px', background: '#eee' }}>Produit</th>
                  <th style={{ border: '1px solid #000', padding: '4px', background: '#eee', textAlign: 'center' }}>Quantité</th>
                  <th style={{ border: '1px solid #000', padding: '4px', background: '#eee' }}>Motif / Heure</th>
                </tr>
              </thead>
              <tbody>
                {todayMovements.entries.map((m, i) => (
                  <tr key={`ent-${i}`}>
                    <td style={{ border: '1px solid #000', padding: '4px', color: '#10b981', fontWeight: 'bold' }}>ENTRÉE</td>
                    <td style={{ border: '1px solid #000', padding: '4px' }}>{m.reason || 'Réapprovisionnement'}</td>
                    <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center', fontWeight: 'bold' }}>+{Math.abs(m.quantity_change)}</td>
                    <td style={{ border: '1px solid #000', padding: '4px', fontSize: '9px' }}>{new Date(m.created_at).toLocaleTimeString('fr-FR')}</td>
                  </tr>
                ))}
                {todayMovements.exits.map((m, i) => (
                  <tr key={`exit-${i}`}>
                    <td style={{ border: '1px solid #000', padding: '4px', color: '#dc2626', fontWeight: 'bold' }}>SORTIE</td>
                    <td style={{ border: '1px solid #000', padding: '4px' }}>{m.reason || 'Vente / Perte'}</td>
                    <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center', fontWeight: 'bold' }}>-{Math.abs(m.quantity_change)}</td>
                    <td style={{ border: '1px solid #000', padding: '4px', fontSize: '9px' }}>{new Date(m.created_at).toLocaleTimeString('fr-FR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : null}

        {/* Signatures et Cachet */}
        <div style={{ marginTop: '40px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', pageBreakInside: 'avoid' }}>
          <div style={{ textAlign: 'center', width: '30%' }}>
            <p style={{ margin: '0 0 10px 0', fontSize: '14px', fontWeight: 'bold' }}>Visa Pharmacien</p>
            {signature ? (
              <img src={signature} alt="Signature" style={{ height: '60px', display: 'block', margin: '0 auto' }} />
            ) : (
              <div style={{ height: '60px' }}></div>
            )}
            <p style={{ marginTop: '10px', fontSize: '12px', color: '#555' }}>_______________________</p>
          </div>

          <div style={{ textAlign: 'center', width: '30%' }}>
            <p style={{ margin: '0 0 10px 0', fontSize: '14px', fontWeight: 'bold' }}>Visa Gestionnaire</p>
            <div style={{ height: '60px' }}></div>
            <p style={{ marginTop: '10px', fontSize: '12px', color: '#555' }}>_______________________</p>
          </div>
          
          <div style={{ textAlign: 'center', width: '30%', position: 'relative' }}>
            <p style={{ margin: '0 0 10px 0', fontSize: '14px', fontWeight: 'bold' }}>Cachet de la Pharmacie</p>
            <img src="/cachet.png" alt="Cachet" style={{ height: '80px', display: 'block', margin: '0 auto', opacity: 0.8 }} onError={(e) => { e.target.style.display = 'none'; }} />
            <p style={{ marginTop: '10px', fontSize: '12px', color: '#555' }}>_______________________</p>
          </div>
        </div>
      </div>

      {/* ===== STYLES D'IMPRESSION ===== */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area { display: block !important; position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
          @page { margin: 10mm; size: A4 portrait; }
        }
      `}</style>
    </>
  );
};

export default Inventaire;