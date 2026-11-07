import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import db from '../db';
import { syncAll } from '../services/syncService';

const EntreesOperateurs = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const operatorIdFromUrl = searchParams.get('operator_id');

  const [operators, setOperators] = useState([]);
  const [selectedOperator, setSelectedOperator] = useState(operatorIdFromUrl || '');
  const [type, setType] = useState('mega');
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  useEffect(() => {
    fetchOperators();
  }, []);

  const fetchOperators = async () => {
    try {
      const data = await db.operators.toArray();
      setOperators(data || []);
    } catch (error) {
      console.error('Erreur chargement opérateurs depuis Dexie:', error);
      setMessage({ text: 'Erreur de chargement des opérateurs', type: 'error' });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedOperator) {
      setMessage({ text: 'Veuillez sélectionner un opérateur', type: 'error' });
      return;
    }
    if (!quantity || parseInt(quantity) <= 0) {
      setMessage({ text: 'Veuillez entrer une quantité positive', type: 'error' });
      return;
    }

    setLoading(true);
    setMessage({ text: '', type: '' });

    try {
      const response = await api.post('/operator/stock/add', {
        operator_id: selectedOperator,
        type: type,
        quantity: parseInt(quantity)
      });

      if (response.data.success) {
        setMessage({
          text: `✅ ${quantity} ${type === 'mega' ? 'mégas' : type === 'unite' ? 'unités' : type.toUpperCase()} ajoutés au stock !`,
          type: 'success'
        });
        setQuantity(1);
        await syncAll();
        await fetchOperators();
      } else {
        setMessage({ text: response.data.error || 'Erreur', type: 'error' });
      }
    } catch (error) {
      console.error(error);
      setMessage({ text: '❌ Erreur serveur', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '1.5rem', color: '#1e3a8a' }}>📦 Entrées de stock pour opérateurs</h1>
      <p style={{ marginBottom: '2rem', color: '#6b7280' }}>Ajoutez des quantités (mégas, unités, FC, USD) à un opérateur.</p>

      <form onSubmit={handleSubmit} style={{ background: 'white', padding: '2rem', borderRadius: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem' }}>Opérateur</label>
          <select
            value={selectedOperator}
            onChange={(e) => setSelectedOperator(e.target.value)}
            style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }}
            required
          >
            <option value="">Sélectionner un opérateur</option>
            {operators.map(op => (
              <option key={op.id} value={op.id}>
                {op.name} (Mégas: {op.stock_megas || 0}, Unités: {op.stock_unites || 0}, FC: {op.stock_fc || 0}, USD: {op.stock_usd || 0})
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem' }}>Type de stock</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }}
          >
            <option value="mega">Mégas</option>
            <option value="unite">Unités</option>
            <option value="fc">FC (Francs Congolais)</option>
            <option value="usd">USD (Dollars)</option>
          </select>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem' }}>Quantité</label>
          <input
            type="number"
            min="1"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }}
          />
        </div>

        {message.text && (
          <div style={{
            padding: '0.75rem',
            borderRadius: '0.5rem',
            marginBottom: '1rem',
            background: message.type === 'success' ? '#d1fae5' : '#fecaca',
            color: message.type === 'success' ? '#065f46' : '#991b1b'
          }}>
            {message.text}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%',
            padding: '0.75rem',
            background: '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: '0.5rem',
            fontSize: '1rem',
            cursor: 'pointer',
            opacity: loading ? 0.7 : 1
          }}
        >
          {loading ? 'Ajout en cours...' : 'Ajouter au stock'}
        </button>

        <button
          type="button"
          onClick={() => navigate('/admin')}
          style={{
            width: '100%',
            padding: '0.75rem',
            marginTop: '0.5rem',
            background: 'transparent',
            color: '#3b82f6',
            border: 'none',
            borderRadius: '0.5rem',
            cursor: 'pointer',
            textDecoration: 'underline'
          }}
        >
          Retour à l'administration
        </button>
      </form>
    </div>
  );
};

export default EntreesOperateurs;