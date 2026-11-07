import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

const PRIMARY = '#065f46';
const ACCENT = '#10b981';
const DANGER = '#dc2626';

const ProductScanner = ({ onProductFound, onClose }) => {
  const [error, setError] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [lastScan, setLastScan] = useState(null);
  const scannerRef = useRef(null);
  const mountedRef = useRef(true);

  const SCANNER_ID = 'qr-scanner-container';

  useEffect(() => {
    mountedRef.current = true;
    startScanner();
    return () => {
      mountedRef.current = false;
      stopScanner();
    };
  }, []);

  const startScanner = async () => {
    try {
      setError(null);
      setScanning(true);

      // Attendre que le DOM soit prêt
      await new Promise(resolve => setTimeout(resolve, 200));

      const scanner = new Html5Qrcode(SCANNER_ID);
      scannerRef.current = scanner;

      const config = {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0,
      };

      await scanner.start(
        { facingMode: 'environment' }, // caméra arrière sur téléphone
        config,
        (decodedText) => {
          if (!mountedRef.current) return;
          handleScanSuccess(decodedText);
        },
        () => {} // ignore les erreurs de scan intermédiaires
      );
    } catch (err) {
      console.error('Erreur démarrage scanner:', err);
      if (mountedRef.current) {
        setError(
          'Impossible d\'accéder à la caméra. Vérifiez les permissions du navigateur.\n' +
          'Si vous êtes en HTTP (pas HTTPS), la caméra peut être bloquée.'
        );
        setScanning(false);
      }
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        const state = scannerRef.current.getState();
        // State 2 = SCANNING, state 3 = PAUSED
        if (state === 2 || state === 3) {
          await scannerRef.current.stop();
        }
        scannerRef.current.clear();
      } catch (err) {
        console.warn('Erreur arrêt scanner:', err);
      }
      scannerRef.current = null;
    }
    setScanning(false);
  };

  const handleScanSuccess = (decodedText) => {
    // Éviter les doubles scans consécutifs
    if (lastScan === decodedText) return;
    setLastScan(decodedText);

    // Petit feedback visuel
    if (navigator.vibrate) navigator.vibrate(100);

    onProductFound(decodedText);

    // Reset pour permettre un nouveau scan du même produit
    setTimeout(() => setLastScan(null), 1500);
  };

  const handleClose = async () => {
    await stopScanner();
    onClose();
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0,
      width: '100%', height: '100%',
      background: 'rgba(0,0,0,0.85)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 3000,
      padding: '1rem',
    }}>
      <div style={{
        background: 'white',
        borderRadius: '1rem',
        padding: '1.5rem',
        maxWidth: '500px',
        width: '100%',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0, color: PRIMARY, fontSize: '1.3rem' }}>📷 Scanner un produit</h2>
          <button
            onClick={handleClose}
            style={{
              background: '#f3f4f6',
              border: 'none',
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              cursor: 'pointer',
              fontSize: '1.2rem',
            }}
          >
            ✕
          </button>
        </div>

        {error ? (
          <div style={{ background: '#fef2f2', padding: '1rem', borderRadius: '0.5rem', color: DANGER, fontSize: '0.85rem' }}>
            <strong>⚠️ Erreur caméra</strong>
            <p style={{ margin: '0.5rem 0' }}>{error}</p>
            <p style={{ margin: 0, fontSize: '0.8rem', color: '#6b7280' }}>
              💡 <strong>En développement local</strong> : la caméra ne marche qu'en HTTPS ou sur <code>localhost</code>. Pour tester sur téléphone, déployez l'app ou utilisez un tunnel HTTPS (ngrok).
            </p>
          </div>
        ) : (
          <>
            <div
              id={SCANNER_ID}
              style={{
                width: '100%',
                borderRadius: '0.75rem',
                overflow: 'hidden',
                background: '#000',
                minHeight: '280px',
                position: 'relative',
              }}
            />
            {scanning && (
              <p style={{ textAlign: 'center', marginTop: '1rem', color: '#6b7280', fontSize: '0.9rem' }}>
                Placez le QR code du médicament devant la caméra...
              </p>
            )}
            {lastScan && (
              <p style={{ textAlign: 'center', marginTop: '0.5rem', color: ACCENT, fontSize: '0.9rem', fontWeight: 'bold' }}>
                ✅ QR détecté : {lastScan}
              </p>
            )}
          </>
        )}

        <button
          onClick={handleClose}
          style={{
            width: '100%',
            marginTop: '1rem',
            padding: '0.75rem',
            background: '#9ca3af',
            color: 'white',
            border: 'none',
            borderRadius: '0.5rem',
            cursor: 'pointer',
            fontSize: '1rem',
          }}
        >
          Annuler
        </button>
      </div>
    </div>
  );
};

export default ProductScanner;