import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import db from '../db';
import { syncAll } from '../services/syncService';

// Couleurs pharmacie
const PRIMARY = '#065f46';
const ACCENT = '#10b981';
const WARN = '#f59e0b';
const DANGER = '#dc2626';

const TYPES_AJUSTEMENT = [
  { value: 'peremption', label: '⏰ Péremption (médicament expiré)' },
  { value: 'casse', label: '💥 Casse / bris' },
  { value: 'perte', label: '🕵️ Perte / vol' },
  { value: 'retour_fournisseur', label: '📦 Retour fournisseur' },
  { value: 'autre', label: '🔄 Autre ajustement' },
];

const AjustementsStock = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const productIdFromUrl = searchParams.get('product_id');

  const [products, setProducts] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(productIdFromUrl || '');
  const [typeAjustement, setTypeAjustement] = useState('peremption');
  const [quantity, setQuantity] = useState(1);
  const [motif, setMotif] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const data = await db.products.toArray();
      setProducts(data || []);
    } catch (error) {
      console.error('Erreur chargement produits:', error);
      setMessage({ text: 'Erreur de chargement des produits', type: 'error' });
    }
  };

  const selectedProductData = products.find(p => p.id === selectedProduct);
  const stockActuel = selectedProductData?.current_stock || 0;

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
    if (qty > stockActuel) {
      setMessage({ text: `Stock insuffisant (seulement ${stockActuel} unités disponibles)`, type: 'error' });
      return;
    }

    setLoading(true);
    setMessage({ text: '', type: '' });

    try {
      const typeLabel = TYPES_AJUSTEMENT.find(t => t.value === typeAjustement)?.label || typeAjustement;
      const reason = `[AJUSTEMENT] ${typeLabel} - ${qty} unité(s)${motif ? ' - Motif: ' + motif : ''}`;

      // Appel backend avec movement_type = 'stock_loss' (stock retiré, non compté comme vente)
      const response = await api.post('/movement', {
        product_id: selectedProduct,
        quantity: qty,
        movement_type: 'stock_loss',
        cooperant_id: null,
        reason,
      });

      if (response.data.success) {
        setMessage({
          text: `✅ ${qty} unité(s) retirée(s) du stock (${typeLabel})`,
          type: 'success',
        });
        setQuantity(1);
        setMotif('');
        await syncAll();
        await fetchProducts();
      } else {
        setMessage({ text: response.data.error || 'Erreur', type: 'error' });
      }
    } catch (error) {
      console.error(error);
      setMessage({ text: '❌ ' + (error.response?.data?.error || 'Erreur serveur'), type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '700px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '0.5rem', color: PRIMARY }}>🔄 Ajustements de stock</h1>
      <p style={{ marginBottom: '2rem', color: '#6b7280' }}>
        Retirez des médicaments du stock (péremption, casse, perte, retour fournisseur)
      </p>

      <form onSubmit={handleSubmit} style={{ background: 'white', padding: '2rem', borderRadius: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
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
                {p.name}{p.dosage ? ` ${p.dosage}` : ''} — Stock: {p.current_stock || 0}
              </option>
            ))}
          </select>
        </div>

        {/* Info produit */}
        {selectedProductData && (
          <div style={{ background: '#f3f4f6', padding: '0.75rem', borderRadius: '0.5rem', marginBottom: '1rem', fontSize: '0.85rem' }}>
            <strong>Stock actuel :</strong> {stockActuel} unités
            {selectedProductData.lot && <> · <strong>Lot :</strong> {selectedProductData.lot}</>}
            {selectedProductData.date_peremption && (
              <>
                {' · '}
                <strong>Péremption :</strong>{' '}
                <span style={{ color: new Date(selectedProductData.date_peremption) <= new Date() ? DANGER : '#1f2937' }}>
                  {new Date(selectedProductData.date_peremption).toLocaleDateString('fr-FR')}
                </span>
              </>
            )}
          </div>
        )}

        {/* Type d'ajustement */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem' }}>Type d'ajustement *</label>
          <select
            value={typeAjustement}
            onChange={(e) => setTypeAjustement(e.target.value)}
            style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }}
          >
            {TYPES_AJUSTEMENT.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        {/* Quantité */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem' }}>Quantité à retirer (unités) *</label>
          <input
            type="number"
            min="1"
            max={stockActuel}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }}
            required
          />
          {stockActuel > 0 && (
            <small style={{ color: '#6b7280' }}>Maximum : {stockActuel} unités</small>
          )}
        </div>

        {/* Motif détaillé */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem' }}>Motif détaillé (optionnel)</label>
          <textarea
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
            placeholder="Ex: Lot LOT-2025-001 expiré le 15/03/2026"
            rows={3}
            style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #d1d5db', fontFamily: 'inherit' }}
          />
        </div>

        {/* Warning péremption */}
        {selectedProductData?.date_peremption && new Date(selectedProductData.date_peremption) <= new Date() && (
          <div style={{ padding: '0.75rem', borderRadius: '0.5rem', marginBottom: '1rem', background: '#fef2f2', color: DANGER, fontSize: '0.85rem', border: `1px solid ${DANGER}` }}>
            ⚠️ Ce médicament est <strong>déjà expiré</strong>. Un ajustement pour péremption est recommandé.
          </div>
        )}

        {/* Warning vidage complet */}
        {quantity > 0 && parseInt(quantity) === stockActuel && stockActuel > 0 && (
          <div style={{ padding: '0.75rem', borderRadius: '0.5rem', marginBottom: '1rem', background: '#fffbeb', color: WARN, fontSize: '0.85rem', border: `1px solid ${WARN}` }}>
            ⚠️ Vous allez <strong>vider tout le stock</strong> de ce médicament.
          </div>
        )}

        {/* Message */}
        {message.text && (
          <div style={{ padding: '0.75rem', borderRadius: '0.5rem', marginBottom: '1rem', background: message.type === 'success' ? '#d1fae5' : '#fecaca', color: message.type === 'success' ? PRIMARY : '#991b1b' }}>
            {message.text}
          </div>
        )}

        {/* Boutons */}
        <button
          type="submit"
          disabled={loading || stockActuel === 0}
          style={{
            width: '100%', padding: '0.75rem',
            background: stockActuel === 0 ? '#9ca3af' : DANGER,
            color: 'white', border: 'none', borderRadius: '0.5rem', fontSize: '1rem',
            cursor: stockActuel === 0 ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? 'Enregistrement...' : '🔄 Enregistrer l\'ajustement'}
        </button>

        <button
          type="button"
          onClick={() => navigate('/stocks')}
          style={{ width: '100%', padding: '0.75rem', marginTop: '0.5rem', background: 'transparent', color: PRIMARY, border: 'none', borderRadius: '0.5rem', cursor: 'pointer', textDecoration: 'underline' }}
        >
          Voir la liste des stocks
        </button>
      </form>

      {/* Guide */}
      <div style={{ marginTop: '2rem', background: '#fffbeb', padding: '1rem', borderRadius: '0.75rem', borderLeft: `4px solid ${WARN}`, fontSize: '0.85rem', color: '#374151' }}>
        <strong>💡 Quand utiliser cet écran ?</strong>
        <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.25rem' }}>
          <li><strong>Péremption</strong> : médicaments dont la date est dépassée</li>
          <li><strong>Casse</strong> : flacons brisés, boîtes endommagées</li>
          <li><strong>Perte / vol</strong> : disparition constatée à l'inventaire</li>
          <li><strong>Retour fournisseur</strong> : médicaments retournés (erreur de commande)</li>
        </ul>
        <p style={{ margin: '0.5rem 0 0' }}>⚠️ Pour les <strong>ventes</strong>, utilisez l'écran <strong>Ventes</strong>, pas cet écran.</p>
      </div>
    </div>
  );
};

export default AjustementsStock;