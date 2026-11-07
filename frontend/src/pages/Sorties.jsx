import { useEffect, useState } from 'react';
import api from '../services/api';
import db from '../db';
import { syncAll } from '../services/syncService';
import ProductScanner from '../components/ProductScanner';

const PRIMARY = '#065f46';
const ACCENT = '#10b981';
const WARN = '#f59e0b';
const DANGER = '#dc2626';

const Sorties = () => {
  const [products, setProducts] = useState([]);
  const [clients, setClients] = useState([]);
  const [cart, setCart] = useState([]);
  const [todaySales, setTodaySales] = useState([]);
  const [selectedClient, setSelectedClient] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [note, setNote] = useState('');
  const [search, setSearch] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });
  
  // État pour stocker la dernière vente et permettre l'impression
  const [lastSale, setLastSale] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [productsData, clientsData, salesData] = await Promise.all([
        db.products.toArray(),
        db.clients.toArray(),
        db.sales.toArray(),
      ]);
      setProducts(productsData || []);
      setClients((clientsData || []).sort((a, b) => (a.name || '').localeCompare(b.name || '')));

      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const todaySales = (salesData || [])
        .filter(s => new Date(s.sale_date) >= startOfDay)
        .sort((a, b) => new Date(b.sale_date) - new Date(a.sale_date))
        .slice(0, 20);
      setTodaySales(todaySales);
    } catch (err) {
      console.error('Erreur chargement:', err);
      setMessage({ text: 'Erreur de chargement des données', type: 'error' });
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
    await fetchData();
  };

  const addToCart = (product) => {
    if (!product || product.current_stock <= 0) {
      setMessage({ text: `⚠️ "${product.name}" est en rupture de stock`, type: 'error' });
      return;
    }
    setCart(prev => {
      const existing = prev.find(item => item.product_id === product.id);
      if (existing) {
        if (existing.quantity >= product.current_stock) {
          setMessage({
            text: `⚠️ Stock max atteint pour "${product.name}" (${product.current_stock} disponibles)`,
            type: 'error',
          });
          return prev;
        }
        return prev.map(item =>
          item.product_id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [
        ...prev,
        {
          product_id: product.id,
          name: product.name,
          dosage: product.dosage || '',
          unit_price: parseFloat(product.unit_price) || 0,
          quantity: 1,
          max_stock: product.current_stock,
        },
      ];
    });
    setMessage({ text: '', type: '' });
  };

  const removeFromCart = (productId) => {
    setCart(prev => prev.filter(item => item.product_id !== productId));
  };

  const updateQuantity = (productId, newQty) => {
    const qty = parseInt(newQty) || 0;
    if (qty <= 0) {
      removeFromCart(productId);
      return;
    }
    setCart(prev =>
      prev.map(item => {
        if (item.product_id !== productId) return item;
        const finalQty = Math.min(qty, item.max_stock);
        return { ...item, quantity: finalQty };
      })
    );
  };

  const clearCart = () => {
    if (cart.length === 0) return;
    if (window.confirm('Vider le panier ?')) {
      setCart([]);
    }
  };

  const handleProductScanned = async (code) => {
    let all = products;
    if (all.length === 0) {
      all = await db.products.toArray();
    }
    const product = all.find(p => p.code === code);

    if (!product) {
      setMessage({ text: `❌ Aucun médicament trouvé pour le code "${code}"`, type: 'error' });
      return;
    }

    if (product.current_stock <= 0) {
      setMessage({ text: `⚠️ "${product.name}" est en rupture de stock`, type: 'error' });
      return;
    }

    addToCart(product);
    setShowScanner(false);
    setMessage({ text: `✅ "${product.name}" ajouté au panier`, type: 'success' });
  };

  const total = cart.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (cart.length === 0) {
      setMessage({ text: 'Le panier est vide', type: 'error' });
      return;
    }
    if (total <= 0) {
      setMessage({ text: 'Le montant total doit être supérieur à 0', type: 'error' });
      return;
    }

    setLoading(true);
    setMessage({ text: '', type: '' });

    try {
      // 1. Créer la vente
      const saleResponse = await api.post('/sale', {
        client_id: selectedClient || null,
        total_amount: total,
        payment_method: paymentMethod,
        note: note || `Vente de ${totalItems} article(s)`,
        sale_type: 'medicament',
      });

      if (!saleResponse.data.success) {
        throw new Error(saleResponse.data.error || 'Erreur création vente');
      }

      const saleId = saleResponse.data.data?.id;

      // 2. Enregistrer les mouvements de stock
      for (const item of cart) {
        await api.post('/movement', {
          product_id: item.product_id,
          quantity: item.quantity,
          movement_type: 'retail_sale',
          cooperant_id: null,
          reference_id: saleId || null,
          reason: `Vente #${saleId ? saleId.substring(0, 8) : 'N/A'} - ${item.quantity} × ${item.name}`,
        });
      }

      // 3. NOUVEAU : Créer automatiquement la transaction dans la Caisse
      await api.post('/cash/transaction', {
        type: 'income',
        category: 'Vente médicaments',
        description: `Vente #${saleId ? saleId.substring(0, 8) : 'N/A'} - ${totalItems} article(s)`,
        amount: total,
        payment_method: paymentMethod,
        transaction_date: new Date().toISOString(),
      });

      // Sauvegarder les détails pour l'impression
      const clientName = clients.find(c => c.id === selectedClient)?.name || 'Client de passage';
      setLastSale({
        id: saleId,
        date: new Date(),
        items: [...cart],
        total,
        paymentMethod,
        clientName,
        note
      });

      setMessage({
        text: `✅ Vente enregistrée : ${total.toFixed(0)} FC (${totalItems} article(s))`,
        type: 'success',
      });
      setCart([]);
      setSelectedClient('');
      setPaymentMethod('cash');
      setNote('');
      setSearch('');

      await syncAll();
      await fetchData();
    } catch (err) {
      console.error('Erreur validation vente:', err);
      setMessage({
        text: '❌ ' + (err.response?.data?.error || err.message || 'Erreur serveur'),
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const filteredProducts = products.filter(p => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      (p.name || '').toLowerCase().includes(s) ||
      (p.dci || '').toLowerCase().includes(s) ||
      (p.code || '').toLowerCase().includes(s) ||
      (p.lot || '').toLowerCase().includes(s)
    );
  });

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

  return (
    <>
      {/* ===== ÉCRAN NORMAL (masqué à l'impression) ===== */}
      <div className="no-print" style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ color: PRIMARY, marginBottom: '0.25rem' }}>💰 Ventes de médicaments</h1>
            <p style={{ color: '#6b7280' }}>Encaissez une vente par scanner ou par recherche manuelle</p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => setShowScanner(true)}
              style={{
                background: ACCENT,
                color: 'white',
                padding: '0.6rem 1.2rem',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                fontSize: '1rem',
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
            >
              📷 Scanner un produit
            </button>
            <button
              onClick={refreshData}
              style={{
                background: '#f3f4f6',
                color: '#374151',
                padding: '0.6rem 1rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                fontSize: '0.9rem',
              }}
            >
              🔄 Actualiser
            </button>
          </div>
        </div>

        {message.text && (
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0.75rem',
            borderRadius: '0.5rem',
            marginBottom: '1rem',
            background: message.type === 'success' ? '#d1fae5' : '#fecaca',
            color: message.type === 'success' ? PRIMARY : '#991b1b',
            border: `1px solid ${message.type === 'success' ? ACCENT : DANGER}`,
          }}>
            <span>{message.text}</span>
            {message.type === 'success' && lastSale && (
              <button
                onClick={handlePrint}
                style={{ background: PRIMARY, color: 'white', border: 'none', padding: '0.4rem 1rem', borderRadius: '0.3rem', cursor: 'pointer', fontWeight: 'bold' }}
              >
                🖨️ Imprimer le ticket
              </button>
            )}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          <div>
            <div style={{ background: 'white', padding: '1.5rem', borderRadius: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
              <h3 style={{ marginTop: 0, color: PRIMARY, marginBottom: '1rem' }}>🔍 Ajouter au panier</h3>

              <input
                type="text"
                placeholder="Rechercher par nom, DCI, code ou lot..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '0.5rem',
                  border: '1px solid #d1d5db',
                  marginBottom: '1rem',
                  fontSize: '0.95rem',
                }}
              />

              <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                {filteredProducts.length === 0 ? (
                  <p style={{ color: '#6b7280', textAlign: 'center', padding: '1rem' }}>
                    Aucun médicament trouvé
                  </p>
                ) : (
                  filteredProducts.map(p => {
                    const inCart = cart.find(c => c.product_id === p.id);
                    const stockBas = (p.current_stock || 0) <= (p.reorder_level || 0);
                    const rupture = (p.current_stock || 0) <= 0;
                    return (
                      <div
                        key={p.id}
                        onClick={() => !rupture && addToCart(p)}
                        style={{
                          padding: '0.75rem',
                          borderBottom: '1px solid #e5e7eb',
                          cursor: rupture ? 'not-allowed' : 'pointer',
                          opacity: rupture ? 0.5 : 1,
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          background: inCart ? '#f0fdf4' : 'transparent',
                        }}
                        onMouseEnter={(e) => {
                          if (!rupture) e.currentTarget.style.background = '#f9fafb';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = inCart ? '#f0fdf4' : 'transparent';
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 'bold', color: '#1f2937', fontSize: '0.95rem' }}>
                            {p.name} {p.dosage && <span style={{ color: '#6b7280', fontSize: '0.85rem' }}>{p.dosage}</span>}
                          </div>
                          <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                            {p.dci && <span>{p.dci} · </span>}
                            Stock :{' '}
                            <span style={{ color: stockBas ? DANGER : '#1f2937', fontWeight: 'bold' }}>
                              {p.current_stock || 0}
                            </span>
                            {p.code && <span style={{ marginLeft: '0.5rem', fontFamily: 'monospace', fontSize: '0.75rem' }}>{p.code}</span>}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: 'bold', color: PRIMARY }}>{parseFloat(p.unit_price || 0).toFixed(0)} FC</div>
                          {rupture ? (
                            <span style={{ fontSize: '0.75rem', color: DANGER }}>Rupture</span>
                          ) : inCart ? (
                            <span style={{ fontSize: '0.75rem', color: ACCENT }}>✓ {inCart.quantity} dans le panier</span>
                          ) : (
                            <span style={{ fontSize: '0.75rem', color: ACCENT }}>+ Ajouter</span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <div>
            <form onSubmit={handleSubmit} style={{ background: 'white', padding: '1.5rem', borderRadius: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0, color: PRIMARY }}>🛒 Panier ({totalItems} article{totalItems > 1 ? 's' : ''})</h3>
                {cart.length > 0 && (
                  <button
                    type="button"
                    onClick={clearCart}
                    style={{ background: '#fef2f2', color: DANGER, border: `1px solid ${DANGER}`, padding: '0.25rem 0.75rem', borderRadius: '0.4rem', cursor: 'pointer', fontSize: '0.8rem' }}
                  >
                    🗑️ Vider
                  </button>
                )}
              </div>

              {cart.length === 0 ? (
                <p style={{ color: '#6b7280', textAlign: 'center', padding: '2rem 0' }}>
                  Le panier est vide.<br />
                  <small>Cliquez sur un médicament ou utilisez le scanner 📷</small>
                </p>
              ) : (
                <div style={{ marginBottom: '1rem' }}>
                  {cart.map(item => (
                    <div
                      key={item.product_id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.6rem 0',
                        borderBottom: '1px solid #e5e7eb',
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{item.name}</div>
                        <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                          {item.unit_price.toFixed(0)} FC × {item.quantity}
                        </div>
                      </div>
                      <input
                        type="number"
                        min="1"
                        max={item.max_stock}
                        value={item.quantity}
                        onChange={(e) => updateQuantity(item.product_id, e.target.value)}
                        style={{
                          width: '60px',
                          padding: '0.3rem',
                          borderRadius: '0.3rem',
                          border: '1px solid #d1d5db',
                          textAlign: 'center',
                        }}
                      />
                      <div style={{ fontWeight: 'bold', color: PRIMARY, minWidth: '80px', textAlign: 'right' }}>
                        {(item.unit_price * item.quantity).toFixed(0)} FC
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFromCart(item.product_id)}
                        style={{ background: 'transparent', border: 'none', color: DANGER, cursor: 'pointer', fontSize: '1.2rem' }}
                        title="Retirer"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div style={{
                background: '#f0fdf4',
                padding: '1rem',
                borderRadius: '0.5rem',
                marginBottom: '1rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                border: `2px solid ${ACCENT}`,
              }}>
                <span style={{ fontSize: '1rem', fontWeight: 'bold' }}>TOTAL</span>
                <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: PRIMARY }}>
                  {total.toFixed(0)} FC
                </span>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.3rem', fontSize: '0.9rem' }}>
                  Patient (optionnel)
                </label>
                <select
                  value={selectedClient}
                  onChange={(e) => setSelectedClient(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }}
                >
                  <option value="">— Client de passage —</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name} {c.phone && `(${c.phone})`}</option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.3rem', fontSize: '0.9rem' }}>
                  Moyen de paiement *
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
                  {[
                    { value: 'cash', label: '💵 Espèces' },
                    { value: 'bank', label: '🏦 Banque' },
                    { value: 'mobile_money', label: '📱 Mobile money' },
                    { value: 'assurance', label: '🏥 Assurance' },
                    { value: 'credit', label: '📝 Crédit' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setPaymentMethod(opt.value)}
                      style={{
                        padding: '0.5rem',
                        borderRadius: '0.4rem',
                        border: paymentMethod === opt.value ? `2px solid ${PRIMARY}` : '1px solid #d1d5db',
                        background: paymentMethod === opt.value ? '#f0fdf4' : 'white',
                        color: paymentMethod === opt.value ? PRIMARY : '#374151',
                        cursor: 'pointer',
                        fontWeight: paymentMethod === opt.value ? 'bold' : 'normal',
                        fontSize: '0.85rem',
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.3rem', fontSize: '0.9rem' }}>
                  Note (optionnel)
                </label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Ex: Ordonnance Dr. Martin"
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }}
                />
              </div>

              <button
                type="submit"
                disabled={loading || cart.length === 0}
                style={{
                  width: '100%',
                  padding: '0.9rem',
                  background: cart.length === 0 ? '#9ca3af' : PRIMARY,
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.5rem',
                  fontSize: '1.1rem',
                  fontWeight: 'bold',
                  cursor: cart.length === 0 ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.7 : 1,
                }}
              >
                {loading ? '⏳ Encaissement...' : `✅ Encaisser ${total.toFixed(0)} FC`}
              </button>
            </form>
          </div>
        </div>

        <div style={{ marginTop: '2rem', background: 'white', padding: '1.5rem', borderRadius: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <h3 style={{ marginTop: 0, color: PRIMARY }}>📋 Ventes du jour ({todaySales.length})</h3>
          {todaySales.length === 0 ? (
            <p style={{ color: '#6b7280' }}>Aucune vente enregistrée aujourd'hui.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
                    <th style={{ padding: '0.5rem' }}>Heure</th>
                    <th style={{ padding: '0.5rem' }}>Patient</th>
                    <th style={{ padding: '0.5rem', textAlign: 'right' }}>Montant</th>
                    <th style={{ padding: '0.5rem' }}>Paiement</th>
                    <th style={{ padding: '0.5rem' }}>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {todaySales.map(s => {
                    const client = clients.find(c => c.id === s.client_id);
                    return (
                      <tr key={s.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                        <td style={{ padding: '0.5rem' }}>{new Date(s.sale_date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</td>
                        <td style={{ padding: '0.5rem' }}>{client?.name || '—'}</td>
                        <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 'bold', color: PRIMARY }}>
                          {parseFloat(s.total_amount || 0).toFixed(0)} FC
                        </td>
                        <td style={{ padding: '0.5rem' }}>{paymentLabel(s.payment_method)}</td>
                        <td style={{ padding: '0.5rem', color: '#6b7280' }}>{s.note || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ===== ZONE D'IMPRESSION DU TICKET DE CAISSE ===== */}
      <div className="print-area" style={{ display: 'none' }}>
        {lastSale && (
          <div style={{ padding: '10px', fontFamily: 'monospace', color: '#000', maxWidth: '80mm', margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: '10px' }}>
              
              {/* LOGO DE LA PHARMACIE ICI */}
              <img 
                src="/logo.jpeg" 
                alt="Logo Pharmacie" 
                style={{ height: '50px', margin: '0 auto 5px', display: 'block', filter: 'grayscale(100%)' }} 
              />

              <h2 style={{ margin: 0, fontSize: '18px', textTransform: 'uppercase' }}>Pharmacie Le Frasah</h2>
              <p style={{ margin: '2px 0', fontSize: '12px' }}>Votre santé, notre priorité</p>
              <p style={{ margin: '2px 0', fontSize: '12px' }}>RDC - Tél: +243 000 000 000</p>
              <p style={{ margin: '5px 0', fontSize: '12px', fontWeight: 'bold' }}>TICKET DE CAISSE</p>
            </div>
            
            <div style={{ fontSize: '12px', marginBottom: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Date:</span>
                <span>{lastSale.date.toLocaleDateString('fr-FR')} {lastSale.date.toLocaleTimeString('fr-FR')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Client:</span>
                <span>{lastSale.clientName}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Ticket N°:</span>
                <span>{lastSale.id ? lastSale.id.substring(0, 8).toUpperCase() : 'N/A'}</span>
              </div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', marginBottom: '10px' }}>
              <thead>
                <tr style={{ borderTop: '1px dashed #000', borderBottom: '1px dashed #000' }}>
                  <th style={{ textAlign: 'left', padding: '4px 0' }}>Article</th>
                  <th style={{ textAlign: 'center', padding: '4px 0' }}>Qté</th>
                  <th style={{ textAlign: 'right', padding: '4px 0' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {lastSale.items.map((item, idx) => (
                  <tr key={idx}>
                    <td style={{ padding: '4px 0', wordBreak: 'break-word' }}>
                      {item.name} {item.dosage}
                    </td>
                    <td style={{ textAlign: 'center', padding: '4px 0' }}>{item.quantity}</td>
                    <td style={{ textAlign: 'right', padding: '4px 0' }}>{(item.unit_price * item.quantity).toFixed(0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ borderTop: '1px dashed #000', paddingTop: '5px', fontSize: '14px', fontWeight: 'bold' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>TOTAL À PAYER:</span>
                <span>{lastSale.total.toFixed(0)} FC</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 'normal', marginTop: '4px' }}>
                <span>Mode de paiement:</span>
                <span style={{ textTransform: 'capitalize' }}>{lastSale.paymentMethod.replace('_', ' ')}</span>
              </div>
            </div>

            <div style={{ textAlign: 'center', marginTop: '15px', fontSize: '11px' }}>
              <p style={{ margin: '2px 0' }}>Merci de votre confiance !</p>
              <p style={{ margin: '2px 0' }}>Les médicaments ne sont ni repris ni échangés.</p>
              <p style={{ margin: '2px 0', marginTop: '10px', fontSize: '10px' }}>Généré par Pharmacie Le Frasah</p>
            </div>
          </div>
        )}
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
            margin: 0;
            size: 80mm auto; /* Format ticket de caisse thermique */
          }
        }
      `}</style>

      {showScanner && (
        <ProductScanner
          onProductFound={handleProductScanned}
          onClose={() => setShowScanner(false)}
        />
      )}
    </>
  );
};

export default Sorties;