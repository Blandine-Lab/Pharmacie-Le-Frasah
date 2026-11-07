import { useEffect, useState } from 'react';
import { supabase } from '../utils/supabaseClient';
import db from '../db';
import { syncAll } from '../services/syncService';

const PRIMARY = '#065f46';
const ACCENT = '#10b981';
const WARN = '#f59e0b';
const DANGER = '#dc2626';
const BLUE = '#3b82f6';

const Vendeurs = () => {
  const [vendeurs, setVendeurs] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modals d'ajout / modification
  const [showModal, setShowModal] = useState(false);
  const [editingVendeur, setEditingVendeur] = useState(null);
  const [formData, setFormData] = useState({ name: '', email: '', phone: '' });

  // Modal de performance
  const [showPerformance, setShowPerformance] = useState(false);
  const [selectedVendeur, setSelectedVendeur] = useState(null);
  const [performanceData, setPerformanceData] = useState(null);
  const [movements, setMovements] = useState([]);

  // Modal Tarifs (Prix des produits)
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [priceData, setPriceData] = useState({});
  const [searchProduct, setSearchProduct] = useState('');
  const [savingPrices, setSavingPrices] = useState(false);

  // Modal Comparateur
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [comparisonData, setComparisonData] = useState([]);
  const [searchCompare, setSearchCompare] = useState('');

  // Signature pour l'impression
  const [signature, setSignature] = useState(localStorage.getItem('pharmacy_signature') || null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const localSellers = await db.sellers.toArray();
      const localProducts = await db.products.toArray();
      
      setVendeurs(localSellers);
      setProducts(localProducts.sort((a, b) => a.name.localeCompare(b.name)));

      if (navigator.onLine) {
        await syncAll();
        const updatedSellers = await db.sellers.toArray();
        const updatedProducts = await db.products.toArray();
        setVendeurs(updatedSellers);
        setProducts(updatedProducts.sort((a, b) => a.name.localeCompare(b.name)));
        setError(null);
      } else if (localSellers.length === 0) {
        setError('Aucune donnée disponible hors ligne.');
      }
    } catch (err) {
      console.error(err);
      setError('Erreur de chargement des données.');
    } finally {
      setLoading(false);
    }
  };

  // ===== GESTION VENDEUR =====
  const openModal = (vendeur = null) => {
    if (vendeur) {
      setEditingVendeur(vendeur);
      setFormData({ name: vendeur.name, email: vendeur.email || '', phone: vendeur.phone || '' });
    } else {
      setEditingVendeur(null);
      setFormData({ name: '', email: '', phone: '' });
    }
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingVendeur(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name) return;

    try {
      const payload = {
        name: formData.name,
        email: formData.email || null,
        phone: formData.phone || null,
      };

      if (editingVendeur) {
        const { error } = await supabase.from('sellers').update(payload).eq('id', editingVendeur.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('sellers').insert([payload]);
        if (error) throw error;
      }
      closeModal();
      await syncAll();
      await fetchData();
    } catch (err) {
      console.error(err);
      setError(err.message);
    }
  };

  const deleteVendeur = async (id) => {
    if (!window.confirm('Supprimer ce vendeur définitivement ?')) return;
    try {
      const { error } = await supabase.from('sellers').delete().eq('id', id);
      if (error) throw error;
      await syncAll();
      await fetchData();
    } catch (err) {
      console.error(err);
      setError(err.message);
    }
  };

  // ===== PERFORMANCES =====
  const viewPerformance = async (vendeur) => {
    setSelectedVendeur(vendeur);
    setShowPerformance(true);
    try {
      const allMovements = await db.stockMovements.toArray();
      const allProducts = await db.products.toArray();
      const productMap = {};
      allProducts.forEach(p => { productMap[p.id] = p; });

      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

      const vendeurMovements = allMovements.filter(m => {
        const d = new Date(m.created_at);
        return m.cooperant_id === vendeur.id && d >= startOfDay && d < endOfDay;
      });

      let totalTake = 0;
      let totalReturn = 0;
      const productStats = {};

      vendeurMovements.forEach(m => {
        const pid = m.product_id;
        if (!pid) return;
        const qty = Math.abs(m.quantity_change);
        if (m.movement_type === 'cooperant_take') {
          totalTake += qty;
          if (!productStats[pid]) productStats[pid] = { qty: 0, price: productMap[pid]?.unit_price || 0 };
          productStats[pid].qty += qty;
        } else if (m.movement_type === 'cooperant_return') {
          totalReturn += qty;
          if (!productStats[pid]) productStats[pid] = { qty: 0, price: productMap[pid]?.unit_price || 0 };
          productStats[pid].qty -= qty;
        }
      });

      let totalNetAmount = 0;
      for (const pid in productStats) {
        totalNetAmount += productStats[pid].qty * productStats[pid].price;
      }

      const sortedMovements = vendeurMovements.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      const enrichedMovements = sortedMovements.map(m => ({ ...m, products: productMap[m.product_id] || null }));

      setPerformanceData({
        totalTake,
        totalReturn,
        netSold: totalTake - totalReturn,
        totalNetAmount,
        movementCount: vendeurMovements.length,
      });
      setMovements(enrichedMovements);
    } catch (err) {
      console.error(err);
      setError('Erreur chargement performances');
    }
  };

  // ===== GESTION DES TARIFS =====
  const openPriceModal = async (vendeur) => {
    setSelectedVendeur(vendeur);
    setShowPriceModal(true);
    setSearchProduct('');
    setPriceData({});

    try {
      const { data } = await supabase.from('seller_prices').select('product_id, price').eq('seller_id', vendeur.id);
      const pricesMap = {};
      if (data) {
        data.forEach(item => { pricesMap[item.product_id] = item.price.toString(); });
      }
      setPriceData(pricesMap);
    } catch (err) {
      console.error(err);
    }
  };

  const handlePriceChange = (productId, value) => {
    setPriceData(prev => ({ ...prev, [productId]: value }));
  };

  const savePrices = async () => {
    setSavingPrices(true);
    try {
      const updates = Object.entries(priceData)
        .filter(([_, price]) => price !== '')
        .map(([productId, price]) => ({
          seller_id: selectedVendeur.id,
          product_id: productId,
          price: parseFloat(price) || 0
        }));

      if (updates.length > 0) {
        const { error } = await supabase.from('seller_prices').upsert(updates, { onConflict: 'seller_id, product_id' });
        if (error) throw error;
      }
      setShowPriceModal(false);
      alert("✅ Tarifs enregistrés !");
    } catch (err) {
      console.error(err);
      alert("❌ Erreur lors de l'enregistrement des tarifs.");
    } finally {
      setSavingPrices(false);
    }
  };

  // ===== COMPARATEUR DE PRIX =====
  const openCompareModal = async () => {
    setShowCompareModal(true);
    setComparisonData([]);
    setSearchCompare('');

    try {
      const { data, error } = await supabase.from('seller_prices').select(`
        price,
        product_id,
        seller_id,
        sellers (name)
      `);

      if (error) throw error;

      const grouped = {};
      data.forEach(item => {
        if (!grouped[item.product_id]) grouped[item.product_id] = [];
        grouped[item.product_id].push({
          sellerName: item.sellers?.name || 'Inconnu',
          price: parseFloat(item.price)
        });
      });

      const result = products.map(prod => {
        const prices = grouped[prod.id] || [];
        const sortedPrices = prices.sort((a, b) => a.price - b.price);
        return {
          product: prod,
          prices: sortedPrices,
          cheapest: sortedPrices.length > 0 ? sortedPrices[0] : null
        };
      }).filter(item => item.prices.length > 0);

      setComparisonData(result);
    } catch (err) {
      console.error(err);
      alert("Erreur lors du chargement du comparateur.");
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center', color: ACCENT }}>Chargement...</div>;

  const filteredProducts = products.filter(p => 
    !searchProduct || p.name.toLowerCase().includes(searchProduct.toLowerCase()) || (p.dci && p.dci.toLowerCase().includes(searchProduct.toLowerCase()))
  );

  const filteredComparison = comparisonData.filter(item =>
    !searchCompare || item.product.name.toLowerCase().includes(searchCompare.toLowerCase()) || (item.product.dci && item.product.dci.toLowerCase().includes(searchCompare.toLowerCase()))
  );

  return (
    <>
      {/* ===== ÉCRAN NORMAL ===== */}
      <div className="no-print" style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ color: PRIMARY, marginBottom: '0.25rem' }}>🤝 Gestion des vendeurs (coopérants)</h1>
            <p style={{ color: '#6b7280', margin: 0 }}>Gérez les vendeurs et comparez leurs tarifs</p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={openCompareModal} style={{ background: WARN, color: 'white', padding: '0.6rem 1.5rem', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold' }}>
              📊 Comparateur de prix
            </button>
            <button onClick={() => openModal()} style={{ background: ACCENT, color: 'white', padding: '0.6rem 1.5rem', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold' }}>
              ➕ Nouveau vendeur
            </button>
          </div>
        </div>

        {error && <div style={{ padding: '0.75rem', borderRadius: '0.5rem', marginBottom: '1rem', background: '#fecaca', color: '#991b1b' }}>{error}</div>}

        {/* Tableau des vendeurs */}
        {vendeurs.length === 0 ? (
          <p style={{ color: '#6b7280' }}>Aucun vendeur enregistré.</p>
        ) : (
          <div style={{ overflowX: 'auto', background: 'white', borderRadius: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', padding: '1rem' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
                  <th style={{ padding: '0.75rem' }}>Nom</th>
                  <th style={{ padding: '0.75rem' }}>Email</th>
                  <th style={{ padding: '0.75rem' }}>Téléphone</th>
                  <th style={{ padding: '0.75rem', textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {vendeurs.map(v => (
                  <tr key={v.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '0.75rem', fontWeight: 'bold' }}>{v.name}</td>
                    <td style={{ padding: '0.75rem', color: '#6b7280' }}>{v.email || '-'}</td>
                    <td style={{ padding: '0.75rem' }}>{v.phone || '-'}</td>
                    <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                      <button onClick={() => openPriceModal(v)} style={{ background: '#e0e7ff', color: '#3730a3', border: '1px solid #c7d2fe', padding: '0.3rem 0.6rem', borderRadius: '0.3rem', cursor: 'pointer', marginRight: '0.3rem', fontSize: '0.8rem', fontWeight: 'bold' }}>
                        🏷️ Tarifs
                      </button>
                      <button onClick={() => viewPerformance(v)} style={{ background: BLUE, color: 'white', border: 'none', padding: '0.3rem 0.6rem', borderRadius: '0.3rem', cursor: 'pointer', marginRight: '0.3rem', fontSize: '0.8rem', fontWeight: 'bold' }}>
                        📊 Performances
                      </button>
                      <button onClick={() => openModal(v)} style={{ background: '#fef3c7', color: '#b45309', border: '1px solid #fcd34d', padding: '0.3rem 0.6rem', borderRadius: '0.3rem', cursor: 'pointer', marginRight: '0.3rem', fontSize: '0.8rem' }}>
                        ✏️
                      </button>
                      <button onClick={() => deleteVendeur(v.id)} style={{ background: '#fee2e2', color: DANGER, border: '1px solid #fca5a5', padding: '0.3rem 0.6rem', borderRadius: '0.3rem', cursor: 'pointer', fontSize: '0.8rem' }}>
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ===== MODAL AJOUT / MODIF VENDEUR ===== */}
        {showModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
            <div style={{ background: 'white', padding: '2rem', borderRadius: '1rem', maxWidth: '500px', width: '100%' }}>
              <h2 style={{ marginTop: 0, color: PRIMARY }}>{editingVendeur ? '✏️ Modifier le vendeur' : '➕ Nouveau vendeur'}</h2>
              <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.2rem' }}>Nom / Entreprise *</label>
                  <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }} />
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.2rem' }}>Email</label>
                  <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }} />
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.2rem' }}>Téléphone</label>
                  <input type="text" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }} />
                </div>
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                  <button type="button" onClick={closeModal} style={{ padding: '0.5rem 1.5rem', background: '#9ca3af', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer' }}>Annuler</button>
                  <button type="submit" style={{ padding: '0.5rem 1.5rem', background: ACCENT, color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 'bold' }}>{editingVendeur ? 'Mettre à jour' : 'Ajouter'}</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ===== MODAL PERFORMANCES ===== */}
        {showPerformance && selectedVendeur && (
          <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
            <div style={{ background: 'white', padding: '2rem', borderRadius: '1rem', maxWidth: '900px', width: '100%', maxHeight: '80vh', overflow: 'auto' }}>
              <h2 style={{ marginTop: 0, color: BLUE }}>📊 Performances de {selectedVendeur.name}</h2>
              <p style={{ color: '#6b7280' }}>Aujourd'hui</p>

              {performanceData ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
                  <div style={{ background: '#f3f4f6', padding: '0.75rem', borderRadius: '0.5rem', textAlign: 'center' }}>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#6b7280' }}>Total Pris</p>
                    <p style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: 0 }}>{performanceData.totalTake}</p>
                  </div>
                  <div style={{ background: '#f3f4f6', padding: '0.75rem', borderRadius: '0.5rem', textAlign: 'center' }}>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#6b7280' }}>Total Retourné</p>
                    <p style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: 0 }}>{performanceData.totalReturn}</p>
                  </div>
                  <div style={{ background: '#f3f4f6', padding: '0.75rem', borderRadius: '0.5rem', textAlign: 'center' }}>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#6b7280' }}>Net Vendu</p>
                    <p style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: 0 }}>{performanceData.netSold}</p>
                  </div>
                  <div style={{ background: '#f3f4f6', padding: '0.75rem', borderRadius: '0.5rem', textAlign: 'center' }}>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#6b7280' }}>Montant (FC)</p>
                    <p style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: 0, color: PRIMARY }}>{performanceData.totalNetAmount.toFixed(0)}</p>
                  </div>
                </div>
              ) : <p>Chargement...</p>}

              <h3 style={{ marginTop: '1rem' }}>📋 Mouvements du jour</h3>
              {movements.length === 0 ? <p>Aucun mouvement aujourd'hui.</p> : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                    <thead>
                      <tr style={{ background: '#f3f4f6' }}>
                        <th style={{ padding: '0.5rem', textAlign: 'left' }}>Heure</th>
                        <th style={{ padding: '0.5rem', textAlign: 'left' }}>Type</th>
                        <th style={{ padding: '0.5rem', textAlign: 'left' }}>Produit</th>
                        <th style={{ padding: '0.5rem', textAlign: 'right' }}>Quantité</th>
                        <th style={{ padding: '0.5rem', textAlign: 'right' }}>Prix unitaire</th>
                      </tr>
                    </thead>
                    <tbody>
                      {movements.map(m => (
                        <tr key={m.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                          <td style={{ padding: '0.5rem' }}>{new Date(m.created_at).toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'})}</td>
                          <td style={{ padding: '0.5rem' }}>{m.movement_type === 'cooperant_take' ? 'Prise' : 'Retour'}</td>
                          <td style={{ padding: '0.5rem' }}>{m.products?.name || '-'}</td>
                          <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 'bold' }}>{Math.abs(m.quantity_change)}</td>
                          <td style={{ padding: '0.5rem', textAlign: 'right' }}>{m.products?.unit_price || 0} FC</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={() => setShowPerformance(false)} style={{ padding: '0.5rem 1.5rem', background: '#9ca3af', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer' }}>Fermer</button>
              </div>
            </div>
          </div>
        )}

        {/* ===== MODAL TARIFS ===== */}
        {showPriceModal && selectedVendeur && (
          <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
            <div style={{ background: 'white', padding: '2rem', borderRadius: '1rem', maxWidth: '800px', width: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2 style={{ margin: 0, color: PRIMARY }}>🏷️ Tarifs de {selectedVendeur.name}</h2>
                <button onClick={() => setShowPriceModal(false)} style={{ background: 'transparent', border: 'none', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
              </div>
              
              <input type="text" placeholder="Rechercher un produit..." value={searchProduct} onChange={(e) => setSearchProduct(e.target.value)} style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #d1d5db', marginBottom: '1rem' }} />

              <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: '0.5rem' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ background: '#f3f4f6', textAlign: 'left', position: 'sticky', top: 0, zIndex: 1 }}>
                      <th style={{ padding: '0.75rem' }}>Produit</th>
                      <th style={{ padding: '0.75rem', width: '150px' }}>Prix d'achat (FC)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.map(p => (
                      <tr key={p.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                        <td style={{ padding: '0.75rem' }}>
                          <div style={{ fontWeight: 'bold' }}>{p.name}</div>
                          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{p.dci}</div>
                        </td>
                        <td style={{ padding: '0.75rem' }}>
                          <input type="number" step="0.01" placeholder="0" value={priceData[p.id] || ''} onChange={(e) => handlePriceChange(p.id, e.target.value)} style={{ width: '100%', padding: '0.4rem', borderRadius: '0.3rem', border: '1px solid #d1d5db' }} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                <button onClick={() => setShowPriceModal(false)} style={{ padding: '0.5rem 1.5rem', background: '#9ca3af', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer' }}>Annuler</button>
                <button onClick={savePrices} disabled={savingPrices} style={{ padding: '0.5rem 1.5rem', background: ACCENT, color: 'white', border: 'none', borderRadius: '0.5rem', cursor: savingPrices ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>
                  {savingPrices ? 'Enregistrement...' : 'Enregistrer les tarifs'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ===== MODAL COMPARATEUR ===== */}
        {showCompareModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
            <div style={{ background: 'white', padding: '2rem', borderRadius: '1rem', maxWidth: '900px', width: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2 style={{ margin: 0, color: WARN }}>📊 Comparateur de prix</h2>
                <button onClick={() => setShowCompareModal(false)} style={{ background: 'transparent', border: 'none', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
              </div>
              
              <input type="text" placeholder="Rechercher un médicament..." value={searchCompare} onChange={(e) => setSearchCompare(e.target.value)} style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #d1d5db', marginBottom: '1rem' }} />
              <p style={{ color: '#6b7280', fontSize: '0.9rem', marginBottom: '1rem' }}>Le prix le moins cher est surligné en vert (🏆).</p>

              <div style={{ flex: 1, overflowY: 'auto' }}>
                {filteredComparison.length === 0 ? (
                  <p style={{ textAlign: 'center', color: '#6b7280', padding: '2rem' }}>Aucun tarif renseigné pour le moment.</p>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
                    {filteredComparison.map(item => (
                      <div key={item.product.id} style={{ border: '1px solid #e5e7eb', borderRadius: '0.5rem', overflow: 'hidden' }}>
                        <div style={{ background: '#f9fafb', padding: '0.75rem', borderBottom: '1px solid #e5e7eb', fontWeight: 'bold' }}>
                          {item.product.name} <span style={{ fontWeight: 'normal', color: '#6b7280' }}>{item.product.dci}</span>
                        </div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                          <tbody>
                            {item.prices.map((p, idx) => {
                              const isCheapest = item.cheapest && p.price === item.cheapest.price;
                              return (
                                <tr key={idx} style={{ borderBottom: idx < item.prices.length - 1 ? '1px solid #e5e7eb' : 'none', background: isCheapest ? '#f0fdf4' : 'white' }}>
                                  <td style={{ padding: '0.5rem 1rem', color: isCheapest ? PRIMARY : '#374151', fontWeight: isCheapest ? 'bold' : 'normal' }}>
                                    {p.sellerName} {isCheapest && '🏆'}
                                  </td>
                                  <td style={{ padding: '0.5rem 1rem', textAlign: 'right', color: isCheapest ? ACCENT : '#374151', fontWeight: 'bold' }}>
                                    {p.price.toFixed(0)} FC
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* BOUTON IMPRIMER LE BON DE PAIEMENT */}
              <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #e5e7eb', paddingTop: '1rem' }}>
                <button onClick={handlePrint} style={{ background: PRIMARY, color: 'white', border: 'none', padding: '0.6rem 1.5rem', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem' }}>
                  🖨️ Imprimer le Bon de Paiement (Moins cher)
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ===== ZONE D'IMPRESSION (Bon de Paiement) ===== */}
      <div className="print-area" style={{ display: 'none' }}>
        <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif', color: '#000' }}>
          
          <div style={{ textAlign: 'center', marginBottom: '20px', borderBottom: '2px solid #065f46', paddingBottom: '15px' }}>
            <img src="/logo.jpeg" alt="Logo" style={{ height: '80px', margin: '0 auto 10px', display: 'block', filter: 'grayscale(100%)' }} />
            <h1 style={{ margin: 0, fontSize: '24px', textTransform: 'uppercase', color: '#065f46' }}>Pharmacie Le Frasah</h1>
            {/* AMÉLIORATION DE L'ADRESSE ICI */}
            <p style={{ margin: '4px 0', fontSize: '14px', color: '#555' }}>RDC - Kinshasa, Avenue de la Santé N°123</p>
            <p style={{ margin: '0', fontSize: '14px', color: '#555' }}>Tél: +243 000 000 000 | Email: contact@pharmacielefrasah.cd</p>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '30px' }}>
            <div>
              <h2 style={{ margin: '0 0 10px 0', fontSize: '20px', textTransform: 'uppercase' }}>Bon de Paiement Fournisseur</h2>
              <p style={{ margin: '2px 0', fontSize: '14px' }}><strong>Date :</strong> {new Date().toLocaleString('fr-FR')}</p>
              <p style={{ margin: '2px 0', fontSize: '14px' }}><strong>Agent chargé du paiement :</strong> _______________________</p>
            </div>
            <div style={{ border: '1px solid #000', padding: '10px', textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: '12px', fontWeight: 'bold' }}>VISA DIRECTION</p>
              <div style={{ height: '40px' }}></div>
            </div>
          </div>

          <p style={{ fontSize: '14px', marginBottom: '10px' }}>
            Veuillez procéder au réapprovisionnement des produits suivants en privilégiant le fournisseur le moins cher indiqué ci-dessous :
          </p>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', marginBottom: '30px' }}>
            <thead>
              <tr style={{ background: '#f3f4f6' }}>
                <th style={{ border: '1px solid #000', padding: '8px', textAlign: 'left' }}>Produit (DCI)</th>
                <th style={{ border: '1px solid #000', padding: '8px', textAlign: 'left' }}>Fournisseur à payer</th>
                <th style={{ border: '1px solid #000', padding: '8px', textAlign: 'right' }}>Prix Unitaire</th>
                <th style={{ border: '1px solid #000', padding: '8px', textAlign: 'center' }}>Qte</th>
                <th style={{ border: '1px solid #000', padding: '8px', textAlign: 'right' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {comparisonData.map(item => {
                if (!item.cheapest) return null;
                return (
                  <tr key={item.product.id}>
                    <td style={{ border: '1px solid #000', padding: '8px', fontWeight: 'bold' }}>
                      {item.product.name}
                      <div style={{ fontSize: '11px', fontWeight: 'normal', color: '#555' }}>{item.product.dci}</div>
                    </td>
                    <td style={{ border: '1px solid #000', padding: '8px', color: PRIMARY, fontWeight: 'bold' }}>{item.cheapest.sellerName}</td>
                    <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'right' }}>{item.cheapest.price.toFixed(0)} FC</td>
                    <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'center' }}>______</td>
                    <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'right' }}>________</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div style={{ marginTop: '50px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', pageBreakInside: 'avoid' }}>
            <div style={{ textAlign: 'center', width: '45%' }}>
              <p style={{ margin: '0 0 10px 0', fontSize: '14px', fontWeight: 'bold' }}>Visa Pharmacien</p>
              {signature ? (
                <img src={signature} alt="Signature" style={{ height: '60px', display: 'block', margin: '0 auto' }} />
              ) : (
                <p style={{ marginTop: '50px', fontSize: '12px', color: '#555' }}>_______________________</p>
              )}
            </div>
            
            <div style={{ textAlign: 'center', width: '45%', position: 'relative' }}>
              <p style={{ margin: '0 0 10px 0', fontSize: '14px', fontWeight: 'bold' }}>Cachet de la Pharmacie</p>
              <img src="/cachet.png" alt="Cachet" style={{ height: '80px', display: 'block', margin: '0 auto', opacity: 0.8 }} onError={(e) => { e.target.style.display = 'none'; }} />
              <p style={{ marginTop: '10px', fontSize: '12px', color: '#555' }}>_______________________</p>
            </div>
          </div>
        </div>
      </div>

      {/* ===== STYLES D'IMPRESSION ===== */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .print-area, .print-area * {
            visibility: visible;
          }
          .print-area {
            display: block !important;
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          .no-print {
            display: none !important;
          }
          @page {
            margin: 15mm;
            size: A4 portrait;
          }
        }
      `}</style>
    </>
  );
};

export default Vendeurs;