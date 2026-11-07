import { useNavigate, useLocation } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

const Navbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  // Couleurs pharmacie (vert)
  const PRIMARY = '#065f46';
  const PRIMARY_RGB = '6, 95, 70';
  const ACCENT = '#10b981';

  // Compteur pour l'accès admin (5 clics sur "Accueil")
  const [clickCount, setClickCount] = useState(0);
  const timerRef = useRef(null);
  
  // État pour le menu mobile
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Définition des onglets
  const tabs = [
    { name: 'Tableau de bord', path: '/api/dashboard' },
    { name: 'Stocks',          path: '/stocks' },
    { name: 'Ventes',          path: '/sorties' },
    { name: 'Clients',         path: '/clients' },
    { name: 'Rapports',        path: '/rapports' },
  ];

  // Gestion du clic sur "Accueil" (5 clics pour admin)
  const handleHomeClick = () => {
    const newCount = clickCount + 1;
    setClickCount(newCount);

    if (timerRef.current) clearTimeout(timerRef.current);
    const timer = setTimeout(() => {
      setClickCount(0);
    }, 3000);
    timerRef.current = timer;

    if (newCount >= 5) {
      clearTimeout(timer);
      setClickCount(0);
      navigate('/admin');
    } else {
      navigate('/');
    }
  };

  const isHome = location.pathname === '/';

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Fermer le menu mobile à chaque changement de page
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  return (
    <nav
      style={{
        background: 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        boxShadow: '0 2px 20px rgba(0,0,0,0.06)',
        position: 'sticky',
        top: 0,
        zIndex: 1000,
        borderBottom: `2px solid ${ACCENT}`,
      }}
    >
      {/* ===== BARRE PRINCIPALE ===== */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.6rem 1rem',
          gap: '0.5rem',
          minHeight: '64px',
        }}
      >
        {/* GAUCHE : Logo + Nom + Boutons Retour/Accueil */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
          <img
            src="/logo.jpeg"
            alt="Pharmacie Le Frasah"
            style={{ height: '36px', width: 'auto', objectFit: 'contain', borderRadius: '0.2rem' }}
            onError={(e) => { e.target.src = '/default.jpg'; }}
          />
          <span style={{ fontWeight: 'bold', fontSize: 'clamp(0.9rem, 2vw, 1.1rem)', color: PRIMARY, whiteSpace: 'nowrap' }}>
            Pharmacie Le Frasah
          </span>

          {/* Boutons Retour / Accueil (cachés sur très petits écrans si besoin, mais ici on les garde) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginLeft: '0.5rem' }}>
            {!isHome && (
              <button
                onClick={() => navigate(-1)}
                style={{ background: `rgba(${PRIMARY_RGB}, 0.08)`, border: 'none', color: PRIMARY, fontSize: '0.85rem', cursor: 'pointer', padding: '0.3rem 0.6rem', borderRadius: '0.5rem', fontWeight: '500' }}
              >
                ⬅️ <span className="hide-on-mobile">Retour</span>
              </button>
            )}
            <button
              onClick={handleHomeClick}
              style={{ background: `rgba(${PRIMARY_RGB}, 0.08)`, border: 'none', color: PRIMARY, fontSize: '0.85rem', cursor: 'pointer', padding: '0.3rem 0.6rem', borderRadius: '0.5rem', fontWeight: '500', position: 'relative' }}
            >
              🏠 <span className="hide-on-mobile">Accueil</span>
              {clickCount > 0 && (
                <span style={{ marginLeft: '0.2rem', fontSize: '0.6rem', background: PRIMARY, color: 'white', padding: '0.1rem 0.35rem', borderRadius: '1rem', opacity: 0.8 }}>
                  {5 - clickCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* CENTRE : Onglets (cachés sur mobile) */}
        <div className="desktop-tabs" style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', flex: 1, justifyContent: 'center' }}>
          {tabs.map((tab) => {
            const isActive = location.pathname === tab.path;
            return (
              <button
                key={tab.path}
                onClick={() => navigate(tab.path)}
                style={{
                  background: isActive ? `rgba(${PRIMARY_RGB}, 0.12)` : 'transparent',
                  border: 'none',
                  color: isActive ? PRIMARY : '#4b5563',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  padding: '0.4rem 0.9rem',
                  borderRadius: '0.5rem',
                  fontWeight: isActive ? '600' : '400',
                  whiteSpace: 'nowrap',
                }}
              >
                {tab.name}
              </button>
            );
          })}
        </div>

        {/* DROITE : Déconnexion + Date (Desktop) + Bouton Hamburger (Mobile) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
          
          {/* Bouton de déconnexion (caché sur mobile) */}
          <button
            onClick={handleLogout}
            className="desktop-tabs"
            style={{ background: 'rgba(239, 68, 68, 0.1)', border: 'none', color: '#dc2626', fontSize: '0.85rem', cursor: 'pointer', padding: '0.3rem 0.8rem', borderRadius: '0.5rem', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
          >
            🚪 Déconnexion
          </button>

          {/* Date (cachée sur mobile) */}
          <span className="desktop-tabs" style={{ fontSize: '0.8rem', opacity: 0.8, color: PRIMARY, background: `rgba(${PRIMARY_RGB}, 0.06)`, padding: '0.3rem 0.8rem', borderRadius: '2rem', whiteSpace: 'nowrap' }}>
            {new Date().toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}
          </span>

          {/* Bouton Hamburger (visible uniquement sur mobile) */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="mobile-menu-btn"
            style={{ background: `rgba(${PRIMARY_RGB}, 0.08)`, border: 'none', color: PRIMARY, width: '42px', height: '42px', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '1.4rem', display: 'none', alignItems: 'center', justifyContent: 'center' }}
          >
            {mobileMenuOpen ? '✕' : '☰'}
          </button>
        </div>
      </div>

      {/* ===== MENU DÉROULANT MOBILE ===== */}
      {mobileMenuOpen && (
        <div
          className="mobile-menu"
          style={{
            padding: '0.5rem 1rem 1rem 1rem',
            borderTop: '1px solid #e5e7eb',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.3rem',
            background: 'white',
          }}
        >
          {tabs.map((tab) => {
            const isActive = location.pathname === tab.path;
            return (
              <button
                key={tab.path}
                onClick={() => navigate(tab.path)}
                style={{
                  padding: '0.75rem 1rem',
                  borderRadius: '0.5rem',
                  background: isActive ? `rgba(${PRIMARY_RGB}, 0.12)` : 'transparent',
                  color: isActive ? PRIMARY : '#374151',
                  fontWeight: isActive ? 'bold' : '500',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: '0.95rem',
                }}
              >
                {isActive ? '● ' : '○ '} {tab.name}
              </button>
            );
          })}
          
          <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '0.5rem 0' }} />
          
          {/* Date et Déconnexion dans le menu mobile */}
          <div style={{ fontSize: '0.8rem', color: '#6b7280', textAlign: 'center', marginBottom: '0.5rem' }}>
            {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>

          <button
            onClick={handleLogout}
            style={{
              padding: '0.75rem 1rem',
              borderRadius: '0.5rem',
              background: 'rgba(239, 68, 68, 0.1)',
              color: '#dc2626',
              fontWeight: 'bold',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'center',
              fontSize: '0.95rem',
            }}
          >
            🚪 Déconnexion
          </button>
        </div>
      )}

      {/* ===== STYLES RESPONSIVE ===== */}
      <style>{`
        @media (max-width: 768px) {
          .desktop-tabs { display: none !important; }
          .mobile-menu-btn { display: flex !important; }
          .hide-on-mobile { display: none; } /* Cache le texte "Retour" et "Accueil" */
        }
        @media (min-width: 769px) {
          .mobile-menu { display: none !important; }
        }
      `}</style>
    </nav>
  );
};

export default Navbar;