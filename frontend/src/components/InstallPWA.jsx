 
import { useEffect, useState } from 'react';

const InstallPWA = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
      setIsInstalled(true);
      return;
    }

    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      const dismissed = localStorage.getItem('pwa_banner_dismissed');
      if (!dismissed) setShowBanner(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setShowBanner(false);
    });

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`Installation: ${outcome}`);
    setDeferredPrompt(null);
    setShowBanner(false);
  };

  const handleDismiss = () => {
    setShowBanner(false);
    localStorage.setItem('pwa_banner_dismissed', 'true');
  };

  if (isInstalled || !showBanner || !deferredPrompt) return null;

  return (
    <div style={{
      position: 'fixed', bottom: '1rem', left: '1rem', right: '1rem',
      maxWidth: '500px', margin: '0 auto', background: 'white',
      borderRadius: '1rem', boxShadow: '0 10px 40px rgba(0,0,0,0.25)',
      padding: '1rem', zIndex: 9999, display: 'flex', alignItems: 'center', gap: '1rem',
      border: '2px solid #10b981', animation: 'slideUp 0.4s ease-out',
    }}>
      <img src="/pwa-192x192.png" alt="App Icon" style={{ width: '50px', height: '50px', borderRadius: '0.5rem' }} onError={(e) => { e.target.src = '/logo.jpeg'; }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 'bold', color: '#065f46', fontSize: '0.95rem' }}>📱 Installer l'application</div>
        <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>Accès rapide depuis votre écran d'accueil</div>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <button onClick={handleInstall} style={{ background: '#065f46', color: 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}>Installer</button>
        <button onClick={handleDismiss} style={{ background: 'transparent', border: 'none', color: '#9ca3af', fontSize: '1.2rem', cursor: 'pointer', padding: '0.2rem' }}>×</button>
      </div>
      <style>{`@keyframes slideUp { from { opacity: 0; transform: translateY(100px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  );
};

export default InstallPWA;