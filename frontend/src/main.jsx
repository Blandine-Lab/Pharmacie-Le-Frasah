import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { checkAndSync } from './services/syncService';

const Root = () => {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    checkAndSync()
      .then(() => {
        console.log('✅ Synchronisation initiale terminée');
        setReady(true);
      })
      .catch((error) => {
        console.error('❌ Erreur lors de la synchronisation initiale:', error);
        // On passe quand même à l'application, même en cas d'erreur
        setReady(true);
      });
  }, []);

  if (!ready) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div style={{ fontSize: '1.5rem', color: '#3b82f6' }}>Chargement des données...</div>
      </div>
    );
  }

  return <App />;
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);