import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import db from '../db';
import { syncAll } from '../services/syncService';

// Liste des opérateurs à afficher
const TARGET_OPERATORS = [
  'Vodacom M-Pesa',
  'Airtel Money',
  'Orange Money',
  'Africell Money'
];

// Mapping des noms vers les noms de fichiers images COMPLETS (avec extension)
const getImageFile = (name) => {
  const map = {
    'Vodacom M-Pesa': 'vodacom-mpesa.jpg',
    'Airtel Money': 'airtel-money.jpg',
    'Orange Money': 'orange-money.jpeg',
    'Africell Money': 'africell-money.jpg'
  };
  return map[name] || `${name.toLowerCase().replace(/\s+/g, '-')}.jpg`;
};

const VentesMega = () => {
  const navigate = useNavigate();
  const [operators, setOperators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchOperators();
  }, []);

  const fetchOperators = async () => {
    try {
      setLoading(true);
      setError(null);

      // 1. Lire depuis Dexie
      const localOperators = await db.operators.toArray();
      const filtered = localOperators.filter(op => TARGET_OPERATORS.includes(op.name));
      
      if (filtered.length > 0) {
        setOperators(filtered);
      } else {
        // Aucun opérateur local, on va essayer de synchroniser
        setError('Aucun opérateur trouvé localement. Synchronisation en cours...');
      }

      // 2. Si connecté, synchroniser et mettre à jour
      if (navigator.onLine) {
        await syncAll(); // synchronise toutes les tables
        const updatedOperators = await db.operators.toArray();
        const updatedFiltered = updatedOperators.filter(op => TARGET_OPERATORS.includes(op.name));
        if (updatedFiltered.length > 0) {
          setOperators(updatedFiltered);
          setError(null);
        } else {
          setError('Aucun opérateur trouvé dans la base de données.');
        }
      } else {
        // Hors ligne : si pas de données, afficher un message
        if (filtered.length === 0) {
          setError('Aucune donnée disponible hors ligne. Connectez-vous pour synchroniser.');
        }
      }
    } catch (err) {
      console.error(err);
      setError('Erreur de chargement des opérateurs');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
        <div style={{ fontSize: '1.5rem', color: '#3b82f6' }}>Chargement...</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ color: '#1e3a8a', marginBottom: '1.5rem' }}>💳 Ventes de méga & e-money</h1>
      <p style={{ color: '#6b7280', marginBottom: '2rem' }}>
        Sélectionnez un opérateur pour gérer les ventes de crédits et d'e-money.
      </p>

      {error && (
        <div style={{ padding: '0.75rem', borderRadius: '0.5rem', marginBottom: '1rem', background: '#fef3c7', color: '#92400e' }}>
          ⚠️ {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1.5rem' }}>
        {operators.map(op => {
          const imageFile = getImageFile(op.name);
          return (
            <div
              key={op.id}
              onClick={() => navigate(`/ventes-mega/operator/${op.id}`)}
              style={{
                background: 'white',
                borderRadius: '1rem',
                boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                cursor: 'pointer',
                overflow: 'hidden',
                transition: 'all 0.3s',
                textAlign: 'center',
                padding: '1rem'
              }}
              onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-5px) scale(1.02)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0) scale(1)'}
            >
              <img
                src={`/${imageFile}`}
                alt={op.name}
                style={{ width: '100%', height: '120px', objectFit: 'contain', marginBottom: '0.5rem' }}
                onError={(e) => { e.target.src = '/default-operator.png'; }}
              />
              <div style={{ fontWeight: 'bold', color: '#1f2937' }}>{op.name}</div>
            </div>
          );
        })}
      </div>

      {operators.length === 0 && !error && (
        <p style={{ textAlign: 'center', color: '#6b7280', marginTop: '2rem' }}>
          Aucun opérateur trouvé. Veuillez ajouter les opérateurs dans la base de données.
        </p>
      )}
    </div>
  );
};

export default VentesMega;