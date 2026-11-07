import { useEffect, useRef, useState } from 'react';
import db from '../db';
import { supabase } from '../utils/supabaseClient';
import { syncAll } from '../services/syncService';
import SignatureCanvasModule from 'react-signature-canvas';

// Correction de l'import Vite (ESM/CJS compatibility)
const SignatureCanvas = SignatureCanvasModule.default || SignatureCanvasModule;

const PRIMARY = '#065f46';
const ACCENT = '#10b981';
const WARN = '#f59e0b';
const DANGER = '#dc2626';

const Clients = () => {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // États Modal Patient
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [formData, setFormData] = useState({
    name: '', phone: '', address: '', date_naissance: '', mutuelle: '', credit_balance: '', client_type: 'individu'
  });

  // États Modal Paiement
  const [showPayModal, setShowPayModal] = useState(false);
  const [payingClient, setPayingClient] = useState(null);
  const [payAmount, setPayAmount] = useState('');
  const [payNote, setPayNote] = useState('');

  // États Dossier Patient (Achats + Paiements)
  const [viewingClient, setViewingClient] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [payments, setPayments] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [activeTab, setActiveTab] = useState('achats');
  const [printHash, setPrintHash] = useState('');

  // ===== ÉTATS POUR LA SIGNATURE =====
  const [showSigModal, setShowSigModal] = useState(false);
  const [signature, setSignature] = useState(localStorage.getItem('pharmacy_signature') || null);
  const sigCanvas = useRef({});

  const fetchClients = async () => {
    try {
      setLoading(true);
      const data = await db.clients.toArray();
      data.sort((a, b) => a.name.localeCompare(b.name));
      setClients(data);
      setError(null);
    } catch (err) {
      console.error(err);
      setError('Erreur de chargement des patients');
    } finally {
      setLoading(false);
    }
  };

  const refreshData = async () => {
    if (navigator.onLine) {
      try { await syncAll(); } catch (e) { console.warn('Erreur sync:', e); }
    }
    await fetchClients();
  };

  useEffect(() => {
    fetchClients();
  }, []);

  // ===== SAUVEGARDE DE LA SIGNATURE =====
  const handleSaveSignature = () => {
    if (!sigCanvas.current || sigCanvas.current.isEmpty()) {
      alert("Veuillez dessiner une signature avant de valider.");
      return;
    }
    // Utilisation de getCanvas() au lieu de getTrimmedCanvas() pour éviter le bug
    const dataUrl = sigCanvas.current.getCanvas().toDataURL('image/png');
    localStorage.setItem('pharmacy_signature', dataUrl);
    setSignature(dataUrl);
    setShowSigModal(false);
  };

  const clearSignature = () => {
    if (sigCanvas.current) {
      sigCanvas.current.clear();
    }
  };

  const resetSavedSignature = () => {
    if (window.confirm("Voulez-vous effacer votre signature enregistrée ?")) {
      localStorage.removeItem('pharmacy_signature');
      setSignature(null);
    }
  };

  // ===== FORMULAIRE PATIENT =====
  const openModal = (client = null) => {
    if (client) {
      setEditingClient(client);
      setFormData({
        name: client.name || '',
        phone: client.phone || '',
        address: client.address || '',
        date_naissance: client.date_naissance || '',
        mutuelle: client.mutuelle || '',
        credit_balance: client.credit_balance?.toString() || '',
        client_type: client.client_type || 'individu',
      });
    } else {
      setEditingClient(null);
      setFormData({
        name: '', phone: '', address: '', date_naissance: '', mutuelle: '', credit_balance: '', client_type: 'individu'
      });
    }
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingClient(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.phone) {
      setError('Le nom et le téléphone sont obligatoires');
      return;
    }

    try {
      const payload = {
        name: formData.name,
        phone: formData.phone,
        address: formData.address || null,
        date_naissance: formData.date_naissance || null,
        mutuelle: formData.mutuelle || null,
        credit_balance: parseFloat(formData.credit_balance) || 0,
        client_type: formData.client_type,
      };

      if (editingClient) {
        const { error } = await supabase.from('clients').update(payload).eq('id', editingClient.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('clients').insert([payload]);
        if (error) throw error;
      }
      closeModal();
      await syncAll();
      await fetchClients();
    } catch (err) {
      console.error(err);
      setError(err.message);
    }
  };

  const deleteClient = async (id) => {
    if (!window.confirm('Supprimer ce patient et tout son historique définitivement ?')) return;
    try {
      const { error } = await supabase.from('clients').delete().eq('id', id);
      if (error) throw error;
      await syncAll();
      await fetchClients();
    } catch (err) {
      console.error(err);
      setError(err.message);
    }
  };

  // ===== PAIEMENT DE CRÉDIT =====
  const openPayModal = (client) => {
    setPayingClient(client);
    setPayAmount('');
    setPayNote('');
    setShowPayModal(true);
  };

  const handlePaymentSubmit = async (e) => {
    e.preventDefault();
    const amount = parseFloat(payAmount);
    if (!amount || amount <= 0) {
      alert("Veuillez entrer un montant valide.");
      return;
    }

    try {
      const { error: payError } = await supabase.from('client_payments').insert([{
        client_id: payingClient.id,
        amount: amount,
        note: payNote || 'Remboursement crédit'
      }]);
      if (payError) throw payError;

      const newPaid = (parseFloat(payingClient.amount_paid) || 0) + amount;
      const { error: clientError } = await supabase
        .from('clients')
        .update({ 
          amount_paid: newPaid,
          payment_date: new Date().toISOString()
        })
        .eq('id', payingClient.id);
      if (clientError) throw clientError;
      
      setShowPayModal(false);
      await syncAll();
      await fetchClients();
    } catch (err) {
      console.error(err);
      alert("Erreur lors de l'enregistrement du paiement : " + err.message);
    }
  };

  // ===== DOSSIER PATIENT =====
  const openHistory = async (client) => {
    setViewingClient(client);
    setShowHistory(true);
    setActiveTab('achats');
    const randomHash = Math.random().toString(36).substring(2, 8).toUpperCase();
    setPrintHash(randomHash);

    try {
      const allSales = await db.sales.toArray();
      const clientSales = allSales
        .filter(s => s.client_id === client.id)
        .sort((a, b) => new Date(b.sale_date) - new Date(a.sale_date))
        .slice(0, 50);
      setTransactions(clientSales);

      const { data: paymentsData } = await supabase
        .from('client_payments')
        .select('*')
        .eq('client_id', client.id)
        .order('payment_date', { ascending: false });
      setPayments(paymentsData || []);
    } catch (err) {
      console.error(err);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // ===== UTILITAIRES =====
  const paymentLabel = (pm) => {
    switch (pm) {
      case 'cash': return 'Espèces';
      case 'bank': return 'Banque';
      case 'mobile_money': return 'Mobile Money';
      case 'assurance': return 'Assurance';
      case 'credit': return 'Crédit';
      default: return 'Autre';
    }
  };

  const calculerAge = (dateNaissance) => {
    if (!dateNaissance) return '-';
    const naissance = new Date(dateNaissance);
    const aujourdhui = new Date();
    let age = aujourdhui.getFullYear() - naissance.getFullYear();
    const m = aujourdhui.getMonth() - naissance.getMonth();
    if (m < 0 || (m === 0 && aujourdhui.getDate() < naissance.getDate())) age--;
    return age >= 0 ? `${age} ans` : '-';
  };

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center', color: ACCENT }}>Chargement des patients...</div>;

  return (
    <>
      {/* ===== ÉCRAN NORMAL ===== */}
      <div className="no-print" style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div>
            <h1 style={{ color: PRIMARY, marginBottom: '0.25rem' }}>🧑‍⚕️ Gestion des patients</h1>
            <p style={{ color: '#6b7280' }}>Dossiers, mutuelles, crédits et historique</p>
          </div>
          <button onClick={() => openModal()} style={{ background: ACCENT, color: 'white', padding: '0.6rem 1.5rem', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold' }}>
            ➕ Nouveau patient
          </button>
        </div>

        {error && <div style={{ padding: '0.75rem', borderRadius: '0.5rem', marginBottom: '1rem', background: '#fecaca', color: '#991b1b' }}>{error}</div>}

        {clients.length === 0 ? (
          <p style={{ color: '#6b7280' }}>Aucun patient enregistré.</p>
        ) : (
          <div style={{ overflowX: 'auto', background: 'white', borderRadius: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', padding: '1rem' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ background: '#f3f4f6', textAlign: 'left', borderBottom: '2px solid #e5e7eb' }}>
                  <th style={{ padding: '0.75rem' }}>Patient</th>
                  <th style={{ padding: '0.75rem' }}>Type</th>
                  <th style={{ padding: '0.75rem' }}>Contact</th>
                  <th style={{ padding: '0.75rem' }}>Mutuelle</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right' }}>Crédit Total</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right' }}>Montant Payé</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right' }}>Reste à Payer</th>
                  <th style={{ padding: '0.75rem', textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {clients.map(c => {
                  const totalCredit = parseFloat(c.credit_balance) || 0;
                  const paid = parseFloat(c.amount_paid) || 0;
                  const reste = Math.max(0, totalCredit - paid);
                  
                  return (
                    <tr key={c.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '0.75rem' }}>
                        <div style={{ fontWeight: 'bold', color: '#1f2937' }}>{c.name}</div>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{calculerAge(c.date_naissance)}</div>
                      </td>
                      <td style={{ padding: '0.75rem' }}>
                        <span style={{ background: c.client_type === 'entreprise' ? '#e0e7ff' : '#fce7f3', color: c.client_type === 'entreprise' ? '#3730a3' : '#9d174d', padding: '0.2rem 0.5rem', borderRadius: '0.3rem', fontSize: '0.75rem', fontWeight: 'bold' }}>
                          {c.client_type === 'entreprise' ? '🏢 Entreprise' : '👤 Individu'}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem' }}>{c.phone}</td>
                      <td style={{ padding: '0.75rem' }}>{c.mutuelle || '-'}</td>
                      <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 'bold' }}>{totalCredit.toFixed(0)} FC</td>
                      <td style={{ padding: '0.75rem', textAlign: 'right', color: ACCENT, fontWeight: 'bold' }}>{paid.toFixed(0)} FC</td>
                      <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 'bold', color: reste > 0 ? DANGER : '#9ca3af' }}>
                        {reste.toFixed(0)} FC
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                        {reste > 0 && (
                          <button onClick={() => openPayModal(c)} style={{ background: WARN, color: 'white', border: 'none', padding: '0.3rem 0.6rem', borderRadius: '0.3rem', cursor: 'pointer', marginRight: '0.3rem', fontSize: '0.8rem', fontWeight: 'bold' }}>
                            💵 Payer
                          </button>
                        )}
                        <button onClick={() => openHistory(c)} style={{ background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', padding: '0.3rem 0.6rem', borderRadius: '0.3rem', cursor: 'pointer', marginRight: '0.3rem', fontSize: '0.8rem' }}>
                          📜 Dossier
                        </button>
                        <button onClick={() => openModal(c)} style={{ background: '#fef3c7', color: '#b45309', border: '1px solid #fcd34d', padding: '0.3rem 0.6rem', borderRadius: '0.3rem', cursor: 'pointer', marginRight: '0.3rem', fontSize: '0.8rem' }}>
                          ✏️
                        </button>
                        <button onClick={() => deleteClient(c.id)} style={{ background: '#fee2e2', color: DANGER, border: '1px solid #fca5a5', padding: '0.3rem 0.6rem', borderRadius: '0.3rem', cursor: 'pointer', fontSize: '0.8rem' }}>
                          🗑️
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ===== MODAL AJOUT / MODIF PATIENT ===== */}
        {showModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
            <div style={{ background: 'white', padding: '2rem', borderRadius: '1rem', maxWidth: '600px', width: '100%', maxHeight: '90vh', overflow: 'auto' }}>
              <h2 style={{ marginTop: 0, color: PRIMARY }}>{editingClient ? '✏️ Modifier le patient' : '➕ Nouveau patient'}</h2>
              <form onSubmit={handleSubmit}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.3rem' }}>Type de client</label>
                    <select value={formData.client_type} onChange={(e) => setFormData({ ...formData, client_type: e.target.value })} style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }}>
                      <option value="individu">👤 Individu (Patient)</option>
                      <option value="entreprise">🏢 Entreprise / Mutuelle</option>
                    </select>
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.3rem' }}>Nom complet / Raison sociale *</label>
                    <input type="text" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.3rem' }}>Téléphone *</label>
                    <input type="text" required value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.3rem' }}>Date de naissance</label>
                    <input type="date" value={formData.date_naissance} onChange={(e) => setFormData({ ...formData, date_naissance: e.target.value })} style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }} />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.3rem' }}>Adresse</label>
                    <input type="text" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.3rem' }}>Mutuelle / Assurance</label>
                    <input type="text" value={formData.mutuelle} onChange={(e) => setFormData({ ...formData, mutuelle: e.target.value })} placeholder="Ex: CNSS, RAMED..." style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.3rem' }}>Crédit initial (FC)</label>
                    <input type="number" step="0.01" value={formData.credit_balance} onChange={(e) => setFormData({ ...formData, credit_balance: e.target.value })} style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                  <button type="button" onClick={closeModal} style={{ padding: '0.5rem 1.5rem', background: '#9ca3af', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer' }}>Annuler</button>
                  <button type="submit" style={{ padding: '0.5rem 1.5rem', background: PRIMARY, color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer' }}>{editingClient ? 'Mettre à jour' : 'Ajouter'}</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ===== MODAL PAIEMENT DE CRÉDIT ===== */}
        {showPayModal && payingClient && (
          <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
            <div style={{ background: 'white', padding: '2rem', borderRadius: '1rem', maxWidth: '400px', width: '100%' }}>
              <h2 style={{ marginTop: 0, color: WARN }}>💵 Encaisser un paiement</h2>
              <p style={{ color: '#6b7280', marginBottom: '1rem' }}>Patient : <strong>{payingClient.name}</strong></p>
              <div style={{ background: '#fef2f2', padding: '1rem', borderRadius: '0.5rem', marginBottom: '1rem', textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: '0.8rem', color: '#6b7280' }}>Reste à payer</p>
                <p style={{ margin: 0, fontSize: '1.5rem', fontWeight: 'bold', color: DANGER }}>
                  {Math.max(0, (parseFloat(payingClient.credit_balance) || 0) - (parseFloat(payingClient.amount_paid) || 0)).toFixed(0)} FC
                </p>
              </div>
              <form onSubmit={handlePaymentSubmit}>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.3rem' }}>Montant reçu (FC)</label>
                  <input type="number" step="0.01" required value={payAmount} onChange={(e) => setPayAmount(e.target.value)} style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db', fontSize: '1.2rem' }} autoFocus />
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.3rem' }}>Note (optionnel)</label>
                  <input type="text" value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder="Ex: Acompte..." style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }} />
                </div>
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                  <button type="button" onClick={() => setShowPayModal(false)} style={{ padding: '0.5rem 1.5rem', background: '#9ca3af', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer' }}>Annuler</button>
                  <button type="submit" style={{ padding: '0.5rem 1.5rem', background: ACCENT, color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 'bold' }}>Confirmer</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ===== MODAL DOSSIER PATIENT ===== */}
        {showHistory && viewingClient && (
          <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
            <div style={{ background: 'white', padding: '2rem', borderRadius: '1rem', maxWidth: '800px', width: '100%', maxHeight: '85vh', overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <div>
                  <h2 style={{ margin: 0, color: PRIMARY }}>📂 Dossier de {viewingClient.name}</h2>
                  <p style={{ color: '#6b7280', fontSize: '0.9rem', margin: '0.3rem 0 0 0' }}>
                    {viewingClient.client_type === 'entreprise' ? '🏢 Entreprise' : '👤 Individu'} — Mutuelle : <strong>{viewingClient.mutuelle || 'Aucune'}</strong>
                  </p>
                </div>
                <div style={{ background: '#fef2f2', padding: '0.5rem 1rem', borderRadius: '0.5rem', textAlign: 'right' }}>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Reste à payer</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: DANGER }}>
                    {Math.max(0, (parseFloat(viewingClient.credit_balance) || 0) - (parseFloat(viewingClient.amount_paid) || 0)).toFixed(0)} FC
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '2px solid #e5e7eb', marginBottom: '1rem' }}>
                <button 
                  onClick={() => setActiveTab('achats')} 
                  style={{ padding: '0.5rem 1rem', borderWidth: '0 0 3px 0', borderStyle: 'solid', borderColor: activeTab === 'achats' ? PRIMARY : 'transparent', background: 'transparent', color: activeTab === 'achats' ? PRIMARY : '#6b7280', fontWeight: 'bold', cursor: 'pointer', fontSize: '1rem' }}
                >
                  🛒 Achats ({transactions.length})
                </button>
                <button 
                  onClick={() => setActiveTab('paiements')} 
                  style={{ padding: '0.5rem 1rem', borderWidth: '0 0 3px 0', borderStyle: 'solid', borderColor: activeTab === 'paiements' ? ACCENT : 'transparent', background: 'transparent', color: activeTab === 'paiements' ? ACCENT : '#6b7280', fontWeight: 'bold', cursor: 'pointer', fontSize: '1rem' }}
                >
                  💵 Paiements ({payments.length})
                </button>
              </div>

              <div style={{ flex: 1, overflowY: 'auto' }}>
                {activeTab === 'achats' && (
                  transactions.length === 0 ? <p style={{ color: '#6b7280' }}>Aucun achat enregistré.</p> : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                      <thead>
                        <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
                          <th style={{ padding: '0.5rem' }}>Date</th>
                          <th style={{ padding: '0.5rem', textAlign: 'right' }}>Montant</th>
                          <th style={{ padding: '0.5rem', textAlign: 'center' }}>Paiement</th>
                          <th style={{ padding: '0.5rem' }}>Note</th>
                        </tr>
                      </thead>
                      <tbody>
                        {transactions.map(t => (
                          <tr key={t.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                            <td style={{ padding: '0.5rem' }}>{new Date(t.sale_date).toLocaleString('fr-FR')}</td>
                            <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 'bold' }}>{parseFloat(t.total_amount).toFixed(0)} FC</td>
                            <td style={{ padding: '0.5rem', textAlign: 'center' }}>{paymentLabel(t.payment_method)}</td>
                            <td style={{ padding: '0.5rem', color: '#6b7280' }}>{t.note || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )
                )}

                {activeTab === 'paiements' && (
                  payments.length === 0 ? <p style={{ color: '#6b7280' }}>Aucun remboursement enregistré.</p> : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                      <thead>
                        <tr style={{ background: '#f0fdf4', textAlign: 'left' }}>
                          <th style={{ padding: '0.5rem' }}>Date du paiement</th>
                          <th style={{ padding: '0.5rem', textAlign: 'right' }}>Montant reçu</th>
                          <th style={{ padding: '0.5rem' }}>Note</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payments.map(p => (
                          <tr key={p.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                            <td style={{ padding: '0.5rem' }}>{new Date(p.payment_date).toLocaleString('fr-FR')}</td>
                            <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 'bold', color: ACCENT }}>+{parseFloat(p.amount).toFixed(0)} FC</td>
                            <td style={{ padding: '0.5rem', color: '#6b7280' }}>{p.note || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )
                )}
              </div>

              <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #e5e7eb', paddingTop: '1rem', gap: '1rem', flexWrap: 'wrap' }}>
                <button onClick={() => setShowSigModal(true)} style={{ padding: '0.5rem 1rem', background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: '0.5rem', cursor: 'pointer' }}>
                  ✍️ Ma Signature
                </button>
                <button onClick={handlePrint} style={{ padding: '0.5rem 1.5rem', background: PRIMARY, color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 'bold' }}>
                  🖨️ Imprimer le dossier
                </button>
                <button onClick={() => setShowHistory(false)} style={{ padding: '0.5rem 1.5rem', background: '#9ca3af', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer' }}>Fermer</button>
              </div>
            </div>
          </div>
        )}

        {/* ===== MODAL SIGNATURE ===== */}
        {showSigModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000 }}>
            <div style={{ background: 'white', padding: '2rem', borderRadius: '1rem', maxWidth: '500px', width: '100%' }}>
              <h2 style={{ marginTop: 0, color: PRIMARY }}>✍️ Dessiner ma signature</h2>
              <p style={{ color: '#6b7280', fontSize: '0.9rem', marginBottom: '1rem' }}>Dessinez avec la souris ou le doigt.</p>
              
              <div style={{ border: '2px dashed #ccc', borderRadius: '0.5rem', background: '#fafafa', marginBottom: '1rem' }}>
                {/* Utilisation du composant corrigé */}
                <SignatureCanvas 
                  ref={sigCanvas} 
                  penColor="#000" 
                  canvasProps={{ width: 450, height: 200, className: 'sigCanvas' }} 
                />
              </div>

              {signature && (
                <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>Signature actuelle :</div>
                  <img src={signature} alt="Signature actuelle" style={{ height: '40px' }} />
                  <button onClick={resetSavedSignature} style={{ background: 'transparent', border: 'none', color: DANGER, fontSize: '0.8rem', cursor: 'pointer', textDecoration: 'underline' }}>Effacer</button>
                </div>
              )}

              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                <button onClick={clearSignature} style={{ padding: '0.5rem 1rem', background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: '0.5rem', cursor: 'pointer' }}>Effacer le dessin</button>
                <button onClick={handleSaveSignature} style={{ padding: '0.5rem 1.5rem', background: ACCENT, color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 'bold' }}>Valider</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ===== ZONE D'IMPRESSION ===== */}
      <div className="print-area" style={{ display: 'none' }}>
        {viewingClient && (
          <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif', color: '#000' }}>
            
            <div style={{ textAlign: 'center', marginBottom: '20px', borderBottom: '2px solid #065f46', paddingBottom: '15px' }}>
              <img src="/logo.jpeg" alt="Logo" style={{ height: '80px', margin: '0 auto 10px', display: 'block', filter: 'grayscale(100%)' }} />
              <h1 style={{ margin: 0, fontSize: '24px', textTransform: 'uppercase', color: '#065f46' }}>Pharmacie Le Frasah</h1>
              <p style={{ margin: '4px 0', fontSize: '14px', color: '#555' }}>Votre santé, notre priorité</p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <div>
                <h2 style={{ margin: '0 0 10px 0', fontSize: '20px' }}>Dossier Patient</h2>
                <p style={{ margin: '2px 0', fontSize: '14px' }}><strong>Nom :</strong> {viewingClient.name}</p>
                <p style={{ margin: '2px 0', fontSize: '14px' }}><strong>Type :</strong> {viewingClient.client_type === 'entreprise' ? 'Entreprise' : 'Individu'}</p>
                <p style={{ margin: '2px 0', fontSize: '14px' }}><strong>Téléphone :</strong> {viewingClient.phone}</p>
              </div>
              <div style={{ textAlign: 'right', fontSize: '14px' }}>
                <p style={{ margin: '2px 0' }}><strong>Date :</strong> {new Date().toLocaleString('fr-FR')}</p>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', backgroundColor: '#f3f4f6', padding: '15px', borderRadius: '8px', marginBottom: '30px', border: '1px solid #ccc' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '12px', color: '#555' }}>Crédit Total</div>
                <div style={{ fontSize: '18px', fontWeight: 'bold' }}>{(parseFloat(viewingClient.credit_balance) || 0).toFixed(0)} FC</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '12px', color: '#555' }}>Montant Payé</div>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#10b981' }}>{(parseFloat(viewingClient.amount_paid) || 0).toFixed(0)} FC</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '12px', color: '#555' }}>Reste à Payer</div>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#dc2626' }}>
                  {Math.max(0, (parseFloat(viewingClient.credit_balance) || 0) - (parseFloat(viewingClient.amount_paid) || 0)).toFixed(0)} FC
                </div>
              </div>
            </div>

            <h3 style={{ marginBottom: '10px', fontSize: '16px', borderBottom: '1px solid #000', paddingBottom: '5px' }}>Historique des Achats</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', marginBottom: '30px' }}>
              <thead>
                <tr style={{ background: '#f3f4f6' }}>
                  <th style={{ border: '1px solid #000', padding: '6px', textAlign: 'left' }}>Date</th>
                  <th style={{ border: '1px solid #000', padding: '6px', textAlign: 'right' }}>Montant</th>
                  <th style={{ border: '1px solid #000', padding: '6px', textAlign: 'center' }}>Paiement</th>
                  <th style={{ border: '1px solid #000', padding: '6px', textAlign: 'left' }}>Note</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map(t => (
                  <tr key={t.id}>
                    <td style={{ border: '1px solid #000', padding: '6px' }}>{new Date(t.sale_date).toLocaleString('fr-FR')}</td>
                    <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'right' }}>{parseFloat(t.total_amount).toFixed(0)} FC</td>
                    <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'center' }}>{paymentLabel(t.payment_method)}</td>
                    <td style={{ border: '1px solid #000', padding: '6px' }}>{t.note || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h3 style={{ marginBottom: '10px', fontSize: '16px', borderBottom: '1px solid #000', paddingBottom: '5px' }}>Historique des Paiements</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: '#f0fdf4' }}>
                  <th style={{ border: '1px solid #000', padding: '6px', textAlign: 'left' }}>Date du paiement</th>
                  <th style={{ border: '1px solid #000', padding: '6px', textAlign: 'right' }}>Montant reçu</th>
                  <th style={{ border: '1px solid #000', padding: '6px', textAlign: 'left' }}>Note</th>
                </tr>
              </thead>
              <tbody>
                {payments.map(p => (
                  <tr key={p.id}>
                    <td style={{ border: '1px solid #000', padding: '6px' }}>{new Date(p.payment_date).toLocaleString('fr-FR')}</td>
                    <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'right', fontWeight: 'bold' }}>+{parseFloat(p.amount).toFixed(0)} FC</td>
                    <td style={{ border: '1px solid #000', padding: '6px' }}>{p.note || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ marginTop: '40px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', pageBreakInside: 'avoid' }}>
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

            <div style={{ marginTop: '30px', textAlign: 'center', fontSize: '10px', color: '#888', borderTop: '1px dashed #ccc', paddingTop: '10px' }}>
              <p style={{ margin: '2px 0' }}>Document signé numériquement. ID : <strong>{printHash}</strong></p>
            </div>

          </div>
        )}
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area { display: block !important; position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
          @page { margin: 15mm; size: A4 portrait; }
        }
      `}</style>
    </>
  );
};

export default Clients;