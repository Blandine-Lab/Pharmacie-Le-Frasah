import { useEffect, useState } from 'react';
import { supabase } from '../utils/supabaseClient';
import db from '../db';

const PRIMARY = '#065f46';
const ACCENT = '#10b981';
const WARN = '#f59e0b';
const DANGER = '#dc2626';
const BLUE = '#3b82f6';

const LEAD_TIME_DAYS = 5;
const SAFETY_DAYS = 3;
const ANALYSIS_PERIOD_DAYS = 30;

const CommandesFournisseurs = () => {
  const [orders, setOrders] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [signature, setSignature] = useState(localStorage.getItem('pharmacy_signature') || null);

  // États pour l'Intelligence
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [aiAdvices, setAiAdvices] = useState([]);
  const [financialStats, setFinancialStats] = useState(null);
  const [generatingAi, setGeneratingAi] = useState(false);

  // États pour l'Aperçu du Bon d'Achat
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewItems, setPreviewItems] = useState([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [ordersData, sellersData] = await Promise.all([
        supabase.from('purchase_orders').select('*').order('created_at', { ascending: false }),
        db.sellers.toArray()
      ]);
      if (ordersData.data) setOrders(ordersData.data);
      setSellers(sellersData || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // ===== LE CERVEAU : INTELLIGENCE D'ACHAT & FINANCIÈRE =====
  const runAiAnalysis = async () => {
    setGeneratingAi(true);
    setShowAiModal(true);
    setAiSuggestions([]);
    setAiAdvices([]);
    setFinancialStats(null);

    try {
      const [allProducts, stockMovements, allSales, allClients] = await Promise.all([
        db.products.toArray(),
        db.stockMovements.toArray(),
        db.sales.toArray(),
        db.clients.toArray(),
      ]);

      const now = new Date();
      const pastDate = new Date(now.getTime() - (ANALYSIS_PERIOD_DAYS * 24 * 3600 * 1000));

      // 1. Analyse Financière
      const recentSales = allSales.filter(s => new Date(s.sale_date) >= pastDate);
      const ca30d = recentSales.reduce((sum, s) => sum + (parseFloat(s.total_amount) || 0), 0);

      const recentSaleMovements = stockMovements.filter(m => 
        m.movement_type === 'retail_sale' && new Date(m.created_at) >= pastDate
      );
      let cogs = 0;
      recentSaleMovements.forEach(m => {
        const prod = allProducts.find(p => p.id === m.product_id);
        if (prod) cogs += Math.abs(m.quantity_change) * (parseFloat(prod.prix_achat) || 0);
      });

      const margeBrute = ca30d - cogs;
      const margePct = ca30d > 0 ? (margeBrute / ca30d) * 100 : 0;

      const totalCredits = allClients.reduce((sum, c) => 
        sum + Math.max(0, (parseFloat(c.credit_balance) || 0) - (parseFloat(c.amount_paid) || 0)), 0
      );

      // 2. Analyse des Stocks
      const suggestions = [];
      const advices = [];

      allProducts.forEach(prod => {
        const productSales = recentSaleMovements.filter(m => m.product_id === prod.id);
        const totalSold = productSales.reduce((sum, m) => sum + Math.abs(m.quantity_change), 0);
        const dailySales = totalSold / ANALYSIS_PERIOD_DAYS;
        const targetStock = Math.ceil(dailySales * (LEAD_TIME_DAYS + SAFETY_DAYS));
        
        let suggestedQty = Math.max(0, targetStock - (prod.current_stock || 0));

        if (totalSold === 0 && (prod.current_stock || 0) <= (prod.reorder_level || 0)) {
          suggestedQty = Math.max(10, (prod.reorder_level || 0) * 2);
        }

        let isExpiring = false;
        if (prod.date_peremption) {
          const expDate = new Date(prod.date_peremption);
          const daysToExpire = Math.floor((expDate - now) / (24 * 3600 * 1000));
          if (daysToExpire < 90 && (prod.current_stock || 0) > 10) {
            isExpiring = true;
            suggestedQty = 0; 
            advices.push(`⚠️ Ne rachetez pas "${prod.name}". Il expire dans ${daysToExpire} jours et vous en avez ${prod.current_stock} en stock. Faites une promotion !`);
          }
        }

        if (suggestedQty > 0 && !isExpiring) {
          let reason = "Stock optimal";
          if ((prod.current_stock || 0) === 0) reason = "🔴 Rupture";
          else if ((prod.current_stock || 0) <= (prod.reorder_level || 0)) reason = "🟠 Sous le seuil";
          else if (dailySales > 0) reason = `📈 Vente rapide (~${dailySales.toFixed(1)}/j)`;

          suggestions.push({
            product: prod,
            current_stock: prod.current_stock || 0,
            daily_sales: dailySales,
            suggested_qty: suggestedQty,
            reason,
            estimated_price: parseFloat(prod.prix_achat) || 0
          });
        }
      });

      suggestions.sort((a, b) => b.suggested_qty - a.suggested_qty);

      // 3. Conseils Financiers
      let budgetAchat = suggestions.reduce((sum, item) => sum + (item.suggested_qty * item.estimated_price), 0);

      if (margePct < 20 && ca30d > 0) {
        advices.push(`📉 Votre marge brute est de ${margePct.toFixed(1)}%. C'est un peu faible. Négociez vos prix d'achat avec les fournisseurs.`);
      } else if (ca30d > 0) {
        advices.push(`✅ Votre marge brute est bonne (${margePct.toFixed(1)}%). Continuez ainsi !`);
      }

      if (totalCredits > (ca30d * 0.3)) {
        advices.push(`🚨 Trésorerie : Vos patients vous doivent ${totalCredits.toFixed(0)} FC (plus de 30% de votre CA). Relancez les débiteurs avant de payer les fournisseurs !`);
      }

      advices.push(`💰 Stratégie : Le coût estimé de cette commande est de ${budgetAchat.toFixed(0)} FC. Si votre caisse le permet, payez comptant pour obtenir des remises.`);

      setAiSuggestions(suggestions);
      setAiAdvices(advices);
      setFinancialStats({ ca30d, margeBrute, margePct, totalCredits, budgetAchat });
      
    } catch (err) {
      console.error(err);
      alert("Erreur lors de l'analyse des données.");
    } finally {
      setGeneratingAi(false);
    }
  };

  const handleQtyChange = (productId, newQty) => {
    setAiSuggestions(prev => prev.map(item => 
      item.product.id === productId ? { ...item, suggested_qty: parseInt(newQty) || 0 } : item
    ));
  };

  const removeSuggestion = (productId) => {
    setAiSuggestions(prev => prev.filter(item => item.product.id !== productId));
  };

  // Ouvre l'aperçu du Bon d'Achat
  const generatePurchaseOrder = () => {
    const validItems = aiSuggestions.filter(item => item.suggested_qty > 0);
    if (validItems.length === 0) {
      alert("Aucun produit à commander.");
      return;
    }
    setPreviewItems(validItems);
    setShowAiModal(false);
    setShowPreviewModal(true);
  };

  // Lance l'impression native
  const handlePrint = () => {
    window.print();
  };

  return (
    <>
      {/* ===== ÉCRAN NORMAL (masqué à l'impression) ===== */}
      <div className="no-print" style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ color: PRIMARY, marginBottom: '0.25rem' }}>🚚 Commandes Fournisseurs</h1>
            <p style={{ color: '#6b7280', margin: 0 }}>Gérez vos bons de commande et réapprovisionnements</p>
          </div>
          <button
            onClick={runAiAnalysis}
            style={{ background: BLUE, color: 'white', padding: '0.6rem 1.5rem', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem', boxShadow: '0 4px 6px rgba(59, 130, 246, 0.3)' }}
          >
            💡 Lancer l'Intelligence d'Achat
          </button>
        </div>

        <div style={{ background: 'white', padding: '1.5rem', borderRadius: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <h3 style={{ marginTop: 0, color: PRIMARY }}>📋 Historique des commandes</h3>
          {orders.length === 0 ? <p style={{ color: '#6b7280' }}>Aucune commande enregistrée.</p> : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
                  <th style={{ padding: '0.5rem' }}>Date</th>
                  <th style={{ padding: '0.5rem' }}>Fournisseur</th>
                  <th style={{ padding: '0.5rem' }}>Montant</th>
                  <th style={{ padding: '0.5rem' }}>Statut</th>
                </tr>
              </thead>
              <tbody>
                {orders.map(o => {
                  const seller = sellers.find(s => s.id === o.supplier_id);
                  return (
                    <tr key={o.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '0.5rem' }}>{new Date(o.created_at).toLocaleDateString('fr-FR')}</td>
                      <td style={{ padding: '0.5rem', fontWeight: 'bold' }}>{seller?.name || 'Inconnu'}</td>
                      <td style={{ padding: '0.5rem' }}>{parseFloat(o.total_amount).toFixed(0)} FC</td>
                      <td style={{ padding: '0.5rem' }}>
                        <span style={{ background: o.status === 'pending' ? '#fef3c7' : '#d1fae5', color: o.status === 'pending' ? '#92400e' : PRIMARY, padding: '0.2rem 0.5rem', borderRadius: '0.3rem', fontSize: '0.75rem', fontWeight: 'bold' }}>
                          {o.status === 'pending' ? 'En attente' : 'Reçue'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ===== MODAL 1 : INTELLIGENCE D'ACHAT ===== */}
      {showAiModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: '#f9fafb', padding: '2rem', borderRadius: '1rem', maxWidth: '1000px', width: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div>
                <h2 style={{ margin: 0, color: BLUE }}>💡 Assistant d'Achat & Financier</h2>
                <p style={{ color: '#6b7280', margin: '0.2rem 0 0 0', fontSize: '0.9rem' }}>
                  Analyse des ventes, des marges et de la trésorerie.
                </p>
              </div>
              <button onClick={() => setShowAiModal(false)} style={{ background: 'transparent', border: 'none', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
            </div>

            {generatingAi ? (
              <div style={{ textAlign: 'center', padding: '3rem' }}>
                <div style={{ fontSize: '1.5rem', color: BLUE }}>⏳ Analyse des données en cours...</div>
              </div>
            ) : (
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                
                {/* Bilan Financier */}
                {financialStats && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
                    <div style={{ background: 'white', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #e5e7eb', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>CA (30 jours)</div>
                      <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: PRIMARY }}>{financialStats.ca30d.toFixed(0)} FC</div>
                    </div>
                    <div style={{ background: 'white', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #e5e7eb', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>Marge Brute</div>
                      <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: financialStats.margePct >= 20 ? ACCENT : DANGER }}>
                        {financialStats.margePct.toFixed(1)}%
                      </div>
                    </div>
                    <div style={{ background: 'white', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #e5e7eb', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>Crédits Clients</div>
                      <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: WARN }}>{financialStats.totalCredits.toFixed(0)} FC</div>
                    </div>
                    <div style={{ background: 'white', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #e5e7eb', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>Budget Achat</div>
                      <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: BLUE }}>{financialStats.budgetAchat.toFixed(0)} FC</div>
                    </div>
                  </div>
                )}

                {/* Conseils */}
                {aiAdvices.length > 0 && (
                  <div style={{ background: '#fffbeb', borderLeft: '4px solid #f59e0b', padding: '1rem', borderRadius: '0.5rem' }}>
                    <h4 style={{ margin: '0 0 0.5rem 0', color: '#b45309' }}>🧠 Conseils de Gestion & Trésorerie</h4>
                    <ul style={{ margin: 0, paddingLeft: '1.5rem', fontSize: '0.9rem', color: '#92400e' }}>
                      {aiAdvices.map((adv, i) => <li key={i} style={{ marginBottom: '0.3rem' }}>{adv}</li>)}
                    </ul>
                  </div>
                )}

                {/* Tableau des suggestions */}
                <div style={{ background: 'white', borderRadius: '0.5rem', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                    <thead>
                      <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
                        <th style={{ padding: '0.75rem' }}>Produit</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center' }}>Stock</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center' }}>Raison</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center', width: '120px' }}>Qté à Cmder</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {aiSuggestions.length === 0 ? (
                        <tr><td colSpan="5" style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>✅ Stocks optimaux. Aucune commande urgente.</td></tr>
                      ) : (
                        aiSuggestions.map(item => (
                          <tr key={item.product.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                            <td style={{ padding: '0.75rem', fontWeight: 'bold' }}>
                              {item.product.name}
                              <div style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 'normal' }}>{item.product.dci}</div>
                            </td>
                            <td style={{ padding: '0.75rem', textAlign: 'center', color: item.current_stock === 0 ? DANGER : 'inherit', fontWeight: 'bold' }}>{item.current_stock}</td>
                            <td style={{ padding: '0.75rem', textAlign: 'center', fontSize: '0.8rem' }}>{item.reason}</td>
                            <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                              <input 
                                type="number" min="1" value={item.suggested_qty} 
                                onChange={(e) => handleQtyChange(item.product.id, e.target.value)}
                                style={{ width: '80px', padding: '0.4rem', textAlign: 'center', borderRadius: '0.3rem', border: `2px solid ${ACCENT}`, fontWeight: 'bold' }}
                              />
                            </td>
                            <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                              <button onClick={() => removeSuggestion(item.product.id)} style={{ background: '#fee2e2', color: DANGER, border: 'none', padding: '0.3rem 0.6rem', borderRadius: '0.3rem', cursor: 'pointer', fontSize: '0.8rem' }}>Retirer</button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* GROS BOUTON POUR GÉNÉRER LE BON D'ACHAT */}
            {!generatingAi && aiSuggestions.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.5rem', borderTop: '2px solid #e5e7eb', paddingTop: '1rem' }}>
                <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: PRIMARY }}>
                  Coût total estimé : {aiSuggestions.reduce((sum, item) => sum + (item.suggested_qty * item.estimated_price), 0).toFixed(0)} FC
                </div>
                <button 
                  onClick={generatePurchaseOrder}
                  style={{ background: PRIMARY, color: 'white', border: 'none', padding: '0.8rem 2rem', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', boxShadow: '0 4px 6px rgba(6, 95, 70, 0.3)' }}
                >
                  ✅ Valider et Générer le Bon d'Achat
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== MODAL 2 : APERÇU DU BON D'ACHAT AVANT IMPRESSION ===== */}
      {showPreviewModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000, padding: '1rem' }}>
          <div style={{ background: 'white', padding: '2rem', borderRadius: '1rem', maxWidth: '900px', width: '100%', maxHeight: '95vh', display: 'flex', flexDirection: 'column' }}>
            
            <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #e5e7eb', paddingBottom: '1rem' }}>
              <h2 style={{ margin: 0, color: PRIMARY }}>📄 Aperçu du Bon d'Achat</h2>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <button onClick={() => setShowPreviewModal(false)} style={{ padding: '0.5rem 1.5rem', background: '#9ca3af', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 'bold' }}>
                  Fermer
                </button>
                <button onClick={handlePrint} style={{ padding: '0.5rem 2rem', background: ACCENT, color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  🖨️ Imprimer
                </button>
              </div>
            </div>

            {/* Contenu du document (visible à l'écran ET à l'impression) */}
            <div style={{ flex: 1, overflowY: 'auto', background: '#f3f4f6', padding: '1rem' }}>
              <div className="print-area" style={{ background: 'white', padding: '40px', margin: '0 auto', maxWidth: '800px', fontFamily: 'Arial, sans-serif', color: '#000' }}>
                
                <div style={{ textAlign: 'center', marginBottom: '20px', borderBottom: '2px solid #065f46', paddingBottom: '15px' }}>
                  <img src="/logo.jpeg" alt="Logo" style={{ height: '80px', margin: '0 auto 10px', display: 'block', filter: 'grayscale(100%)' }} />
                  <h1 style={{ margin: 0, fontSize: '24px', textTransform: 'uppercase', color: '#065f46' }}>Pharmacie Le Frasah</h1>
                  <p style={{ margin: '4px 0', fontSize: '14px', color: '#555' }}>RDC - Kinshasa, Avenue de la Santé N°123</p>
                  <p style={{ margin: '0', fontSize: '14px', color: '#555' }}>Tél: +243 000 000 000 | Email: contact@pharmacielefrasah.cd</p>
                </div>

                <div style={{ textAlign: 'center', marginBottom: '30px' }}>
                  <h2 style={{ margin: 0, fontSize: '20px', textTransform: 'uppercase', display: 'inline-block', borderBottom: '2px solid #000', paddingBottom: '5px' }}>
                    BON D'ACHAT (À DONNER À L'AGENT)
                  </h2>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                  <div>
                    <p style={{ margin: '2px 0', fontSize: '14px' }}><strong>Date :</strong> {new Date().toLocaleString('fr-FR')}</p>
                    <p style={{ margin: '2px 0', fontSize: '14px' }}><strong>Agent chargé de l'achat :</strong> _______________________</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ margin: '2px 0', fontSize: '14px' }}><strong>N° Commande :</strong> CMD-{Math.floor(Math.random() * 10000)}</p>
                  </div>
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', marginBottom: '30px' }}>
                  <thead>
                    <tr style={{ background: '#f3f4f6' }}>
                      <th style={{ border: '1px solid #000', padding: '8px', textAlign: 'left' }}>Code</th>
                      <th style={{ border: '1px solid #000', padding: '8px', textAlign: 'left' }}>Désignation du produit</th>
                      <th style={{ border: '1px solid #000', padding: '8px', textAlign: 'center' }}>Qté à commander</th>
                      <th style={{ border: '1px solid #000', padding: '8px', textAlign: 'right' }}>Prix Unitaire (Est.)</th>
                      <th style={{ border: '1px solid #000', padding: '8px', textAlign: 'right' }}>Total (Est.)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewItems.map(item => (
                      <tr key={item.product.id}>
                        <td style={{ border: '1px solid #000', padding: '8px', fontFamily: 'monospace' }}>{item.product.code || '-'}</td>
                        <td style={{ border: '1px solid #000', padding: '8px', fontWeight: 'bold' }}>
                          {item.product.name}
                          <div style={{ fontSize: '10px', fontWeight: 'normal', color: '#555' }}>{item.product.dci} {item.product.dosage}</div>
                        </td>
                        <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'center', fontWeight: 'bold', fontSize: '14px' }}>{item.suggested_qty}</td>
                        <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'right' }}>{item.estimated_price.toFixed(0)} FC</td>
                        <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'right', fontWeight: 'bold' }}>{(item.suggested_qty * item.estimated_price).toFixed(0)} FC</td>
                      </tr>
                    ))}
                    
                    <tr style={{ background: '#f3f4f6' }}>
                      <td colSpan="4" style={{ border: '1px solid #000', padding: '8px', textAlign: 'right', fontWeight: 'bold' }}>TOTAL ESTIMÉ :</td>
                      <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'right', fontWeight: 'bold', fontSize: '14px', color: '#065f46' }}>
                        {previewItems.reduce((sum, item) => sum + (item.suggested_qty * item.estimated_price), 0).toFixed(0)} FC
                      </td>
                    </tr>
                  </tbody>
                </table>

                <div style={{ marginTop: '40px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', pageBreakInside: 'avoid' }}>
                  <div style={{ textAlign: 'center', width: '45%' }}>
                    <p style={{ margin: '0 0 10px 0', fontSize: '14px', fontWeight: 'bold' }}>Signature du Pharmacien</p>
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
          </div>
        </div>
      )}

      {/* ===== STYLES D'IMPRESSION ===== */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area { 
            display: block !important; 
            position: absolute; 
            left: 0; 
            top: 0; 
            width: 100%; 
            padding: 0 !important;
          }
          .no-print { display: none !important; }
          @page { margin: 15mm; size: A4 portrait; }
        }
      `}</style>
    </>
  );
};

export default CommandesFournisseurs;