import { useEffect, useState } from 'react';
import db from '../db';

const PRIMARY = '#065f46';
const ACCENT = '#10b981';

const Fournisseurs = () => {
  const [sellers, setSellers] = useState([]);

  useEffect(() => {
    db.sellers.toArray().then(data => setSellers(data));
  }, []);

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ color: PRIMARY, marginBottom: '0.5rem' }}>🏭 Fournisseurs</h1>
      <p style={{ color: '#6b7280', marginBottom: '2rem' }}>Liste de vos partenaires. Ajoutez-en via l'Administration.</p>

      {sellers.length === 0 ? (
        <p style={{ color: '#6b7280' }}>Aucun fournisseur enregistré.</p>
      ) : (
        <div style={{ background: 'white', borderRadius: '1rem', padding: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
                <th style={{ padding: '0.75rem' }}>Nom</th>
                <th style={{ padding: '0.75rem' }}>Contact</th>
                <th style={{ padding: '0.75rem' }}>Téléphone</th>
                <th style={{ padding: '0.75rem' }}>Email</th>
              </tr>
            </thead>
            <tbody>
              {sellers.map(s => (
                <tr key={s.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '0.75rem', fontWeight: 'bold' }}>{s.name}</td>
                  <td style={{ padding: '0.75rem' }}>{s.contact_person || '-'}</td>
                  <td style={{ padding: '0.75rem' }}>{s.phone || '-'}</td>
                  <td style={{ padding: '0.75rem' }}>{s.email || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
export default Fournisseurs;