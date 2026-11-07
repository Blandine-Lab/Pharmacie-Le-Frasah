import { useEffect, useState } from 'react';
import api from '../services/api';
import db from '../db';
import { syncAll } from '../services/syncService';

// Couleurs pharmacie
const PRIMARY = '#065f46';
const ACCENT = '#10b981';
const WARN = '#f59e0b';
const DANGER = '#dc2626';
const BLUE = '#3b82f6';

const Caisse = () => {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  
  // Signature pour l'impression
  const [signature, setSignature] = useState(localStorage.getItem('pharmacy_signature') || null);
  
  // Formulaire
  const [formData, setFormData] = useState({
    type: 'income',
    category: 'Vente médicaments',
    description: '',
    amount: '',
    payment_method: 'cash',
  });

  // Dates
  const [dateRange, setDateRange] = useState({
    start: new Date().toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0],
  });

  // Calculs
  const [openingBalance, setOpeningBalance] = useState(0);
  const [totalIncome, setTotalIncome] = useState(0);
  const [totalExpense, setTotalExpense] = useState(0);
  const [closingBalance, setClosingBalance] = useState(0);

  // Catégories adaptées à la pharmacie
  const CATEGORIES = {
    income: [
      'Vente médicaments',
      'Vente parapharmacie',
      'Vente matériel médical',
      'Remboursement assurance',
      'Apport de trésorerie',
      'Autre entrée',
    ],
    expense: [
      'Achat médicaments',
      'Achat fournitures',
      'Salaire',
      'Loyer',
      'Électricité / Eau',
      'Transport',
      'Entretien',
      'Autre sortie',
    ],
  };

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      const startDate = new Date(dateRange.start);
      const endDate = new Date(dateRange.end);
      endDate.setHours(23, 59, 59, 999);

      const allTransactions = await db.cashTransactions.toArray();

      // 1. Filtrer par période
      const filtered = allTransactions.filter(t => {
        const tDate = new Date(t.transaction_date);
        return tDate >= startDate && tDate <= endDate;
      });

      // 2. Trier par date (du plus ancien au plus récent pour le solde cumulé)
      const sorted = filtered.sort((a, b) => new Date(a.transaction_date) - new Date(b.transaction_date));

      // 3. Calculer le solde d'ouverture (tout ce qui est AVANT la date de début)
      const allBefore = allTransactions.filter(t => new Date(t.transaction_date) < startDate);
      let opening = 0;
      allBefore.forEach(t => {
        if (t.type === 'income') opening += t.amount;
        else opening -= t.amount;
      });
      setOpeningBalance(opening);

      // 4. Ajouter le solde cumulé à chaque transaction
      let runningBalance = opening;
      let inc = 0;
      let exp = 0;

      const withBalance = sorted.map(t => {
        if (t.type === 'income') {
          runningBalance += t.amount;
          inc += t.amount;
        } else {
          runningBalance -= t.amount;
          exp += t.amount;
        }
        return { ...t, runningBalance };
      });

      setTransactions(withBalance);
      setTotalIncome(inc);
      setTotalExpense(exp);
      setClosingBalance(runningBalance);
      setError(null);
    } catch (err) {
      console.error('Erreur chargement des transactions:', err);
      setError('Impossible de charger les données de la caisse');
    } finally {
      setLoading(false);
    }
  };

  const refreshData = async () => {
    if (navigator.onLine) {
      try { await syncAll(); } catch (e) { console.warn('Erreur sync:', e); }
    }
    await fetchTransactions();
  };

  useEffect(() => {
    fetchTransactions();
  }, [dateRange]);

  const handleTypeChange = (newType) => {
    const defaultCategory = newType === 'income' ? 'Vente médicaments' : 'Achat médicaments';
    setFormData(prev => ({ ...prev, type: newType, category: defaultCategory }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      setError('Veuillez entrer un montant valide.');
      return;
    }

    try {
      const response = await api.post('/cash/transaction', {
        ...formData,
        amount: parseFloat(formData.amount),
        transaction_date: new Date().toISOString(),
      });

      if (response.data.success) {
        setShowModal(false);
        setFormData({ type: 'income', category: 'Vente médicaments', description: '', amount: '', payment_method: 'cash' });
        await syncAll();
        await fetchTransactions();
      } else {
        setError(response.data.error || 'Erreur');
      }
    } catch (err) {
      console.error(err);
      setError('❌ Erreur serveur');
    }
  };

  const handleDateChange = (e) => {
    const { name, value } = e.target;
    setDateRange(prev => ({ ...prev, [name]: value }));
  };

  const setQuickDate = (type) => {
    const today = new Date();
    let start = new Date();
    let end = new Date();

    if (type === 'today') {
      start = today;
      end = today;
    } else if (type === 'yesterday') {
      start.setDate(today.getDate() - 1);
      end.setDate(today.getDate() - 1);
    } else if (type === 'week') {
      start.setDate(today.getDate() - 7);
      end = today;
    } else if (type === 'month') {
      start = new Date(today.getFullYear(), today.getMonth(), 1);
      end = today;
    }

    setDateRange({
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0],
    });
  };

  const handlePrint = () => {
    window.print();
  };

  const paymentLabel = (pm) => {
    switch (pm) {
      case 'cash': return 'Espèces';
      case 'bank': return 'Banque';
      case 'mobile_money': return 'Mobile money';
      case 'assurance': return 'Assurance';
      default: return 'Autre';
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
        <div style={{ fontSize: '1.5rem', color: ACCENT }}>Chargement de la caisse...</div>
      </div>
    );
  }

  return (
    <>
      {/* ===== ÉCRAN NORMAL (masqué à l'impression) ===== */}
      <div className="no-print" style={{ padding: '2rem', paddingTop: '80px', maxWidth: '1200px', margin: '0 auto' }}>
        
        {/* En-tête */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ color: PRIMARY, marginBottom: '0.25rem' }}>💰 Caisse / Journal de caisse</h1>
            <p style={{ color: '#6b7280', margin: 0 }}>Suivi des entrées et sorties d'argent de la pharmacie</p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={handlePrint} style={{ background: PRIMARY, color: 'white', padding: '0.6rem 1.5rem', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              🖨️ Imprimer le rapport
            </button>
            <button onClick={() => setShowModal(true)} style={{ background: ACCENT, color: 'white', padding: '0.6rem 1.5rem', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold' }}>
              ➕ Nouvelle transaction
            </button>
          </div>
        </div>

        {/* Filtres de date */}
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', alignItems: 'center', flexWrap: 'wrap', background: 'white', padding: '1rem', borderRadius: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={() => setQuickDate('today')} style={{ padding: '0.4rem 0.8rem', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '0.4rem', cursor: 'pointer', fontSize: '0.85rem' }}>Aujourd'hui</button>
            <button onClick={() => setQuickDate('yesterday')} style={{ padding: '0.4rem 0.8rem', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '0.4rem', cursor: 'pointer', fontSize: '0.85rem' }}>Hier</button>
            <button onClick={() => setQuickDate('week')} style={{ padding: '0.4rem 0.8rem', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '0.4rem', cursor: 'pointer', fontSize: '0.85rem' }}>7 jours</button>
            <button onClick={() => setQuickDate('month')} style={{ padding: '0.4rem 0.8rem', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '0.4rem', cursor: 'pointer', fontSize: '0.85rem' }}>Ce mois</button>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginLeft: 'auto' }}>
            <label style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>Du</label>
            <input type="date" name="start" value={dateRange.start} onChange={handleDateChange} style={{ padding: '0.4rem', borderRadius: '0.4rem', border: '1px solid #d1d5db' }} />
            <label style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>Au</label>
            <input type="date" name="end" value={dateRange.end} onChange={handleDateChange} style={{ padding: '0.4rem', borderRadius: '0.4rem', border: '1px solid #d1d5db' }} />
            <button onClick={refreshData} style={{ background: BLUE, color: 'white', padding: '0.4rem 1rem', border: 'none', borderRadius: '0.4rem', cursor: 'pointer' }}>🔄 Actualiser</button>
          </div>
        </div>

        {error && <div style={{ padding: '0.75rem', borderRadius: '0.5rem', marginBottom: '1rem', background: '#fecaca', color: '#991b1b' }}>{error}</div>}

        {/* KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
          <div style={{ background: 'white', padding: '1rem', borderRadius: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', borderLeft: '4px solid #6b7280' }}>
            <p style={{ margin: 0, color: '#6b7280', fontSize: '0.85rem', fontWeight: 'bold' }}>Solde d'ouverture</p>
            <p style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: '0.3rem 0 0 0', color: '#1f2937' }}>{openingBalance.toFixed(0)} FC</p>
          </div>
          <div style={{ background: 'white', padding: '1rem', borderRadius: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', borderLeft: `4px solid ${ACCENT}` }}>
            <p style={{ margin: 0, color: '#6b7280', fontSize: '0.85rem', fontWeight: 'bold' }}>Total Entrées (+)</p>
            <p style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: '0.3rem 0 0 0', color: ACCENT }}>{totalIncome.toFixed(0)} FC</p>
          </div>
          <div style={{ background: 'white', padding: '1rem', borderRadius: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', borderLeft: `4px solid ${DANGER}` }}>
            <p style={{ margin: 0, color: '#6b7280', fontSize: '0.85rem', fontWeight: 'bold' }}>Total Sorties (-)</p>
            <p style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: '0.3rem 0 0 0', color: DANGER }}>{totalExpense.toFixed(0)} FC</p>
          </div>
          <div style={{ background: '#f0fdf4', padding: '1rem', borderRadius: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', border: `2px solid ${ACCENT}` }}>
            <p style={{ margin: 0, color: PRIMARY, fontSize: '0.85rem', fontWeight: 'bold' }}>Solde de clôture</p>
            <p style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: '0.3rem 0 0 0', color: PRIMARY }}>{closingBalance.toFixed(0)} FC</p>
          </div>
        </div>

        {/* Tableau des transactions */}
        <div style={{ background: 'white', borderRadius: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', padding: '1.5rem' }}>
          <h3 style={{ marginTop: 0, marginBottom: '1rem', color: PRIMARY }}>📋 Journal des transactions</h3>
          {transactions.length === 0 ? (
            <p style={{ color: '#6b7280', textAlign: 'center', padding: '2rem' }}>Aucune transaction sur cette période.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
                    <th style={{ padding: '0.75rem' }}>Date / Heure</th>
                    <th style={{ padding: '0.75rem' }}>Description</th>
                    <th style={{ padding: '0.75rem' }}>Catégorie</th>
                    <th style={{ padding: '0.75rem', textAlign: 'center' }}>Paiement</th>
                    <th style={{ padding: '0.75rem', textAlign: 'right' }}>Entrée</th>
                    <th style={{ padding: '0.75rem', textAlign: 'right' }}>Sortie</th>
                    <th style={{ padding: '0.75rem', textAlign: 'right', background: '#f9fafb' }}>Solde</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((t) => (
                    <tr key={t.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '0.75rem', whiteSpace: 'nowrap' }}>{new Date(t.transaction_date).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                      <td style={{ padding: '0.75rem', fontWeight: 'bold' }}>{t.description || '-'}</td>
                      <td style={{ padding: '0.75rem' }}>{t.category}</td>
                      <td style={{ padding: '0.75rem', textAlign: 'center' }}>{paymentLabel(t.payment_method)}</td>
                      <td style={{ padding: '0.75rem', textAlign: 'right', color: ACCENT, fontWeight: 'bold' }}>
                        {t.type === 'income' ? `+${t.amount.toFixed(0)}` : '-'}
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'right', color: DANGER, fontWeight: 'bold' }}>
                        {t.type === 'expense' ? `-${t.amount.toFixed(0)}` : '-'}
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 'bold', background: '#f9fafb', color: PRIMARY }}>
                        {t.runningBalance.toFixed(0)} FC
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* MODAL NOUVELLE TRANSACTION */}
        {showModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
            <div style={{ background: 'white', padding: '2rem', borderRadius: '1rem', maxWidth: '500px', width: '100%' }}>
              <h2 style={{ marginTop: 0, color: PRIMARY }}>➕ Nouvelle transaction</h2>
              <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.3rem' }}>Type d'opération</label>
                  <select value={formData.type} onChange={(e) => handleTypeChange(e.target.value)} style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db', fontWeight: 'bold', color: formData.type === 'income' ? ACCENT : DANGER }}>
                    <option value="income">➕ Entrée d'argent (Encaissement)</option>
                    <option value="expense">➖ Sortie d'argent (Décaissement)</option>
                  </select>
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.3rem' }}>Catégorie</label>
                  <select value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }}>
                    {CATEGORIES[formData.type].map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.3rem' }}>Montant (FC) *</label>
                  <input type="number" required value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: e.target.value })} style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db', fontSize: '1.2rem', fontWeight: 'bold' }} placeholder="Ex: 5000" />
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.3rem' }}>Description / Motif</label>
                  <input type="text" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }} placeholder="Ex: Achat de 5 boîtes de Doliprane" />
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.3rem' }}>Moyen de paiement</label>
                  <select value={formData.payment_method} onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })} style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }}>
                    <option value="cash">Espèces</option>
                    <option value="bank">Banque</option>
                    <option value="mobile_money">Mobile money</option>
                    <option value="assurance">Assurance / Mutuelle</option>
                    <option value="other">Autre</option>
                  </select>
                </div>
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                  <button type="button" onClick={() => setShowModal(false)} style={{ padding: '0.5rem 1.5rem', background: '#9ca3af', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer' }}>Annuler</button>
                  <button type="submit" style={{ padding: '0.5rem 1.5rem', background: PRIMARY, color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 'bold' }}>Valider la transaction</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* ===== ZONE D'IMPRESSION (Rapport de Caisse) ===== */}
      <div className="print-area" style={{ display: 'none' }}>
        <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif', color: '#000' }}>
          
          <div style={{ textAlign: 'center', marginBottom: '20px', borderBottom: '2px solid #065f46', paddingBottom: '15px' }}>
            <img src="/logo.jpeg" alt="Logo" style={{ height: '80px', margin: '0 auto 10px', display: 'block', filter: 'grayscale(100%)' }} />
            <h1 style={{ margin: 0, fontSize: '24px', textTransform: 'uppercase', color: '#065f46' }}>Pharmacie Le Frasah</h1>
            <p style={{ margin: '4px 0', fontSize: '14px', color: '#555' }}>RDC - Kinshasa, Avenue de la Santé N°123</p>
          </div>

          <div style={{ textAlign: 'center', marginBottom: '20px' }}>
            <h2 style={{ margin: 0, fontSize: '20px', textTransform: 'uppercase', display: 'inline-block', borderBottom: '2px solid #000', paddingBottom: '5px' }}>
              Journal de Caisse (Z-Report)
            </h2>
            <p style={{ margin: '5px 0 0 0', fontSize: '14px' }}>Période : Du {new Date(dateRange.start).toLocaleDateString('fr-FR')} au {new Date(dateRange.end).toLocaleDateString('fr-FR')}</p>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', backgroundColor: '#f3f4f6', padding: '15px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #ccc' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '12px', color: '#555' }}>Solde d'ouverture</div>
              <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{openingBalance.toFixed(0)} FC</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '12px', color: '#555' }}>Total Entrées</div>
              <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#10b981' }}>+{totalIncome.toFixed(0)} FC</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '12px', color: '#555' }}>Total Sorties</div>
              <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#dc2626' }}>-{totalExpense.toFixed(0)} FC</div>
            </div>
            <div style={{ textAlign: 'center', borderLeft: '2px solid #ccc', paddingLeft: '15px' }}>
              <div style={{ fontSize: '12px', color: '#555' }}>SOLDE DE CLÔTURE</div>
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#065f46' }}>{closingBalance.toFixed(0)} FC</div>
            </div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', marginBottom: '30px' }}>
            <thead>
              <tr style={{ background: '#f3f4f6' }}>
                <th style={{ border: '1px solid #000', padding: '6px', textAlign: 'left' }}>Date</th>
                <th style={{ border: '1px solid #000', padding: '6px', textAlign: 'left' }}>Description</th>
                <th style={{ border: '1px solid #000', padding: '6px', textAlign: 'left' }}>Catégorie</th>
                <th style={{ border: '1px solid #000', padding: '6px', textAlign: 'right' }}>Entrée</th>
                <th style={{ border: '1px solid #000', padding: '6px', textAlign: 'right' }}>Sortie</th>
                <th style={{ border: '1px solid #000', padding: '6px', textAlign: 'right', background: '#e5e7eb' }}>Solde</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map(t => (
                <tr key={t.id}>
                  <td style={{ border: '1px solid #000', padding: '6px' }}>{new Date(t.transaction_date).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                  <td style={{ border: '1px solid #000', padding: '6px', fontWeight: 'bold' }}>{t.description || '-'}</td>
                  <td style={{ border: '1px solid #000', padding: '6px' }}>{t.category}</td>
                  <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'right', color: '#10b981', fontWeight: 'bold' }}>
                    {t.type === 'income' ? `${t.amount.toFixed(0)}` : '-'}
                  </td>
                  <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'right', color: '#dc2626', fontWeight: 'bold' }}>
                    {t.type === 'expense' ? `${t.amount.toFixed(0)}` : '-'}
                  </td>
                  <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'right', fontWeight: 'bold', background: '#f9fafb' }}>
                    {t.runningBalance.toFixed(0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Signatures et Visas */}
          <div style={{ marginTop: '40px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', pageBreakInside: 'avoid' }}>
            <div style={{ textAlign: 'center', width: '30%' }}>
              <p style={{ margin: '0 0 10px 0', fontSize: '14px', fontWeight: 'bold' }}>Visa Caissier</p>
              <div style={{ height: '60px' }}></div>
              <p style={{ marginTop: '10px', fontSize: '12px', color: '#555' }}>_______________________</p>
            </div>
            
            <div style={{ textAlign: 'center', width: '30%' }}>
              <p style={{ margin: '0 0 10px 0', fontSize: '14px', fontWeight: 'bold' }}>Visa Gérant</p>
              <div style={{ height: '60px' }}></div>
              <p style={{ marginTop: '10px', fontSize: '12px', color: '#555' }}>_______________________</p>
            </div>

            <div style={{ textAlign: 'center', width: '30%', position: 'relative' }}>
              <p style={{ margin: '0 0 10px 0', fontSize: '14px', fontWeight: 'bold' }}>Cachet de la Pharmacie</p>
              <img src="/cachet.png" alt="Cachet" style={{ height: '80px', display: 'block', margin: '0 auto', opacity: 0.8 }} onError={(e) => { e.target.style.display = 'none'; }} />
            </div>
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
          @page { margin: 10mm; size: A4 landscape; } 
        }
      `}</style>
    </>
  );
};

export default Caisse;