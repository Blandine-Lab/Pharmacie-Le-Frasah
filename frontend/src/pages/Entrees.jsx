import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../utils/supabaseClient';
import api from '../services/api';
import db from '../db';
import { syncAll } from '../services/syncService';

// Couleurs pharmacie
const PRIMARY = '#065f46';
const ACCENT = '#10b981';
const WARN = '#f59e0b';
const DANGER = '#dc2626';

const Entrees = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const productIdFromUrl = searchParams.get('product_id');

  const [products, setProducts] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(productIdFromUrl || '');
  const [selectedSeller, setSelectedSeller] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [lotNumber, setLotNumber] = useState('');
  const [datePeremption, setDatePeremption] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [productsData, sellersData] = await Promise.all([
        db.products.toArray(),
        db.sellers.toArray(),
      ]);
      setProducts(productsData || []);
      setSellers(sellersData || []);
    } catch (error) {
      console.error('Erreur chargement:', error);
      setMessage({ text: 'Erreur de chargement des données', type: 'error' });
    }
  };

  const selectedProductData = products.find(p => p.id === selectedProduct);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedProduct) {
      setMessage({ text: 'Veuillez sélectionner un médicament', type: 'error' });
      return;
    }
    const qty = parseInt(quantity) || 0;
    if (qty <= 0) {
      setMessage({ text: 'Veuillez entrer une quantité positive', type: 'error' });
      return;
    }

    setLoading(true);
    setMessage({ text: '', type: '' });

    try {
      // Construction du motif avec fournisseur + lot + péremption (traçabilité)
      const sellerName = sellers.find(s => s.id === selectedSeller)?.name || '';
      const reasonParts = [`Entrée: ${qty} unité(s)`];
      if (sellerName) reasonParts.push(`Fournisseur: ${sellerName}`);
      if (lotNumber) reasonParts.push(`Lot: ${lotNumber}`);
      if (datePeremption) reasonParts.push(`Péremption: ${datePeremption}`);
      const reason = reasonParts.join(' | ');

      // 1. Créer le mouvement de stock (via API backend)
      const response = await api.post('/movement', {
        product_id: selectedProduct,
        quantity: qty,
        movement_type: 'supplier_in',
        cooperant_id: null,
        reference_id: selectedSeller || null,
        reason,
      });

      if (!response.data.success) {
        throw new Error(response.data.error || 'Erreur inconnue');
      }

      // 2. Mettre à jour le produit avec lot et date de péremption
      if (lotNumber || datePeremption) {
        const updatePayload = {};
        if (lotNumber) updatePayload.lot = lotNumber;
        if (datePeremption) updatePayload.date_peremption = datePeremption;

        const { error: updateErr } = await supabase
          .from('products')
          .update(updatePayload)
          .eq('id', selectedProduct);
        if (updateErr) throw updateErr;
      }

      setMessage({
        text: `✅ ${qty} unité(s) ajoutée(s) au stock !`,
        type: 'success',
      });
      setQuantity(1);
      setLotNumber('');
      setDatePeremption('');
      await syncAll();
      await fetchData();
    } catch (error) {
      console.error(error);
      setMessage({ text: '❌ ' + (error.message || 'Erreur serveur'), type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '700px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '0.5rem', color: PRIMARY }}>📦 Entrées de médicaments</h1>
      <p style={{ marginBottom: '2rem', color: '#6b7280' }}>
        Enregistrez une réception de stock (commande fournisseur, retour, etc.)
      </p>

      <form
        onSubmit={handleSubmit}
        style={{ background: 'white', padding: '2rem', borderRadius: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}
      >
        {/* Médicament */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem' }}>Médicament *</label>
          <select
            value={selectedProduct}
            onChange={(e) => setSelectedProduct(e.target.value)}
            style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }}
            required
          >
            <option value="">Sélectionner un médicament</option>
            {products.map(p => (
              <option key={p.id} value={p.id}>
                {p.name}{p.dosage ? ` ${p.dosage}` : ''}{p.dci ? ` (${p.dci})` : ''} — Stock: {p.current_stock || 0}
              </option>
            ))}
          </select>
        </div>

        {/* Info médicament sélectionné */}
        {selectedProductData && (
          <div style={{
            background: '#f3f4f6',
            padding: '0.75rem',
            borderRadius: '0.5rem',
            marginBottom: '1rem',
            fontSize: '0.85rem',
          }}>
            <strong>Stock actuel :</strong> {selectedProductData.current_stock || 0} unités
            {selectedProductData.lot && <> · <strong>Lot actuel :</strong> {selectedProductData.lot}</>}
            {selectedProductData.date_peremption && (
              <>
                {' · '}
                <strong>Péremption actuelle :</strong>{' '}
                <span style={{ color: new Date(selectedProductData.date_peremption) <= new Date() ? DANGER : '#1f2937' }}>
                  {new Date(selectedProductData.date_peremption).toLocaleDateString('fr-FR')}
                </span>
              </>
            )}
          </div>
        )}

        {/* Fournisseur */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem' }}>Fournisseur</label>
          <select
            value={selectedSeller}
            onChange={(e) => setSelectedSeller(e.target.value)}
            style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }}
          >
            <option value="">— Non précisé —</option>
            {sellers.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <small style={{ color: '#6b7280' }}>
            Ajoutez des fournisseurs depuis <a href="/admin" style={{ color: ACCENT }}>Administration</a>
          </small>
        </div>

        {/* Quantité */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem' }}>Quantité reçue (unités) *</label>
          <input
            type="number"
            min="1"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }}
            required
          />
          <small style={{ color: '#6b7280' }}>
            Nombre de boîtes, comprimés ou flacons reçus
          </small>
        </div>

        {/* Lot + Péremption */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem' }}>N° de lot</label>
            <input
              type="text"
              value={lotNumber}
              onChange={(e) => setLotNumber(e.target.value)}
              placeholder="Ex: LOT-2026-001"
              style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem' }}>Date de péremption</label>
            <input
              type="date"
              value={datePeremption}
              onChange={(e) => setDatePeremption(e.target.value)}
              style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }}
            />
          </div>
        </div>

        {/* Avertissement si date passée */}
        {datePeremption && new Date(datePeremption) < new Date() && (
          <div style={{
            padding: '0.75rem',
            borderRadius: '0.5rem',
            marginBottom: '1rem',
            background: '#fef2f2',
            color: DANGER,
            fontSize: '0.85rem',
            border: `1px solid ${DANGER}`,
          }}>
            ⚠️ Attention : cette date de péremption est <strong>déjà passée</strong>. Vérifiez la saisie.
          </div>
        )}

        {/* Alerte si < 30 jours */}
        {datePeremption && new Date(datePeremption) >= new Date() && new Date(datePeremption) <= new Date(Date.now() + 30 * 24 * 3600 * 1000) && (
          <div style={{
            padding: '0.75rem',
            borderRadius: '0.5rem',
            marginBottom: '1rem',
            background: '#fffbeb',
            color: WARN,
            fontSize: '0.85rem',
            border: `1px solid ${WARN}`,
          }}>
            ⏰ Ce médicament expire dans <strong>moins de 30 jours</strong>. Il sera signalé dans les alertes.
          </div>
        )}

        {/* Message */}
        {message.text && (
          <div style={{
            padding: '0.75rem',
            borderRadius: '0.5rem',
            marginBottom: '1rem',
            background: message.type === 'success' ? '#d1fae5' : '#fecaca',
            color: message.type === 'success' ? PRIMARY : '#991b1b',
          }}>
            {message.text}
          </div>
        )}

        {/* Boutons */}
        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%',
            padding: '0.75rem',
            background: ACCENT,
            color: 'white',
            border: 'none',
            borderRadius: '0.5rem',
            fontSize: '1rem',
            cursor: 'pointer',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? 'Ajout en cours...' : '📥 Ajouter au stock'}
        </button>

        <button
          type="button"
          onClick={() => navigate('/stocks')}
          style={{
            width: '100%',
            padding: '0.75rem',
            marginTop: '0.5rem',
            background: 'transparent',
            color: PRIMARY,
            border: 'none',
            borderRadius: '0.5rem',
            cursor: 'pointer',
            textDecoration: 'underline',
          }}
        >
          Voir la liste des stocks
        </button>
      </form>

      {/* Guide rapide */}
      <div style={{
        marginTop: '2rem',
        background: '#f0fdf4',
        padding: '1rem',
        borderRadius: '0.75rem',
        borderLeft: `4px solid ${ACCENT}`,
        fontSize: '0.85rem',
        color: '#374151',
      }}>
        <strong>💡 Guide rapide</strong>
        <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.25rem' }}>
          <li><strong>Lot</strong> : indiqué sur l'emballage par le fabricant (ex. LOT-ABC-123)</li>
          <li><strong>Péremption</strong> : date d'expiration (obligatoire pour un médicament)</li>
          <li>Le lot et la péremption saisis <strong>écrasent</strong> les anciennes valeurs du produit</li>
          <li>Pour gérer plusieurs lots simultanément, créez une fiche produit par lot</li>
        </ul>
      </div>
    </div>
  );
};

export default Entrees;