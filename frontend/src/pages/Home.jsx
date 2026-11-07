import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';

const modules = [
  { id: 1,  name: 'Tableau de bord',              image: '/Tableau de bord.jpg',              path: '/api/dashboard', permissionKey: 'dashboard', ready: true  },
  { id: 2,  name: 'Gestion des stocks',           image: '/Gestion.jpg',                      path: '/stocks',        permissionKey: 'stocks',    ready: true  },
  { id: 3,  name: 'Entrées de médicaments',       image: '/entre.jpg',                        path: '/entrees',       permissionKey: 'entrees',   ready: true  },
  { id: 4,  name: 'Ventes de médicaments',        image: '/Ventes de médicaments.jpg',        path: '/sorties',       permissionKey: 'sorties',   ready: true  },
  { id: 5,  name: 'Ajustements de stock',         image: '/Ajustements.jpg',                  path: '/ajustements',   permissionKey: 'ajustements', ready: true  },
  { id: 6,  name: 'Gestion des patients/clients', image: '/gestion de patien cleints.jpg',    path: '/clients',       permissionKey: 'clients',   ready: true  },
  { id: 7,  name: 'Pharmaciens & Employés',       image: '/pharmacie employer.jpg',           path: '/vendeurs',      permissionKey: 'vendeurs',  ready: true  },
  { id: 8,  name: 'Caisse / Journal de caisse',   image: '/caisse.jpg',                       path: '/caisse',        permissionKey: 'caisse',    ready: true  },
  { id: 9,  name: 'Rapports & Statistiques',      image: '/Rapports.jpg',                     path: '/rapports',      permissionKey: 'rapports',  ready: true  },
  { id: 10, name: 'Gestion des utilisateurs',     image: '/gestion utilisateur.jpg',          path: '/utilisateurs',  permissionKey: 'admin',     ready: true  },
  { id: 11, name: 'Paramètres',                   image: '/parametres.jpg',                   path: '/parametres',    permissionKey: 'parametres',ready: true  },
  { id: 12, name: 'Sauvegarde / Export',          image: '/sauvegarde.jpg',                   path: '/sauvegarde',    permissionKey: 'sauvegarde',ready: true  },
  { id: 13, name: 'Administration',               image: '/administration.jpg',               path: '/admin',         permissionKey: 'admin',     ready: true  },
  { id: 22, name: 'Étiquettes / QR Codes',        image: '/Ajustements de stock.jpg',         path: '/etiquettes',    permissionKey: 'etiquettes',ready: true  },
  { id: 14, name: 'Fournisseurs',                 image: '/fournisseur.jpg',                  path: '/fournisseurs',  permissionKey: 'fournisseurs', ready: true },
  { id: 20, name: 'Journal des mouvements',       image: '/Journal des mouvements.jpg',       path: '/mouvements',    permissionKey: 'mouvements',   ready: true },
  { id: 18, name: 'Alertes péremption',           image: '/alerte.jpg',                       path: '/alertes-peremption', permissionKey: 'alertes-peremption', ready: true },
  { id: 19, name: 'Alertes stock bas',            image: '/alerte .jpg',                      path: '/alertes-stock', permissionKey: 'alertes-stock', ready: true },
  { id: 15, name: 'Ordonnances',                  image: '/ordonances.jpg',                   path: '/ordonnances',   permissionKey: 'ordonnances',  ready: true },
  { id: 16, name: 'Commandes fournisseurs',       image: '/commande fournisseurs.jpg',        path: '/commandes',     permissionKey: 'commandes',    ready: true },
  { id: 17, name: 'Inventaire',                   image: '/inventaire.jpg',                   path: '/inventaire',    permissionKey: 'inventaire',   ready: true },
  { id: 21, name: 'Retours clients',              image: '/Retours clients.jpg',              path: '/retours',       permissionKey: 'retours',      ready: true },
];

const Home = () => {
  const navigate = useNavigate();
  const { hasPermission } = useAuth(); 
  const [loaded, setLoaded] = useState(false);
  const [clickCount, setClickCount] = useState(0);
  const [clickTimer, setClickTimer] = useState(null);

  useEffect(() => {
    setLoaded(true);
  }, []);

  const handleLogoClick = () => {
    const newCount = clickCount + 1;
    setClickCount(newCount);
    clearTimeout(clickTimer);
    const timer = setTimeout(() => setClickCount(0), 3000);
    setClickTimer(timer);
    if (newCount >= 5) {
      clearTimeout(timer);
      setClickCount(0);
      navigate('/admin');
    }
  };

  const handleModuleClick = (mod, hasAccess) => {
    if (!mod.ready) {
      alert(`🔧 Le module "${mod.name}" est en cours de développement.\n\nIl sera disponible prochainement.`);
      return;
    }
    
    if (!hasAccess) {
      alert(`🔒 Accès refusé.\n\nVous n'avez pas les autorisations nécessaires pour accéder au module "${mod.name}".\n\nVeuillez contacter votre administrateur.`);
      return;
    }

    navigate(mod.path);
  };

  return (
    <div style={{ padding: '1.5rem 1rem', background: 'linear-gradient(135deg, #e8f5e9 0%, #f1f8e9 100%)', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      
      {/* ===== CONTENU PRINCIPAL (Enveloppé pour prendre l'espace disponible) ===== */}
      <div style={{ flex: 1 }}>
        
        {/* En-tête */}
        <div style={{ textAlign: 'center', marginBottom: '2.5rem', animation: 'fadeInDown 0.8s ease-out' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem' }}>
            <img
              src="/logo.jpeg"
              alt="Logo Pharmacie Le Frasah"
              onClick={handleLogoClick}
              style={{ height: '70px', width: 'auto', cursor: 'pointer' }}
              onError={(e) => { e.target.src = '/tableau.jpg'; }}
            />
            <h1 style={{
              fontSize: '2rem',
              fontWeight: 'bold',
              margin: 0,
              background: 'linear-gradient(135deg, #065f46, #10b981)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
            }}>
              Pharmacie Le Frasah
            </h1>
            <p style={{ color: '#374151', fontSize: '1.1rem', fontWeight: '500', margin: 0 }}>
              Logiciel de gestion de pharmacie
            </p>
            {clickCount > 0 && (
              <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                {5 - clickCount} clics restants...
              </span>
            )}
          </div>
        </div>

        {/* Grille des modules */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: '1.25rem',
          maxWidth: '1400px',
          margin: '0 auto',
          padding: '0 1rem',
        }}>
          {modules.map((mod, idx) => {
            const hasAccess = mod.permissionKey === 'admin' 
              ? hasPermission('admin') 
              : hasPermission(mod.permissionKey);
              
            return (
              <div
                key={mod.id}
                onClick={() => handleModuleClick(mod, hasAccess)}
                style={{
                  backgroundColor: 'white',
                  borderRadius: '1rem',
                  boxShadow: '0 4px 10px rgba(0,0,0,0.06)',
                  cursor: 'pointer',
                  overflow: 'hidden',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  transform: loaded ? 'translateY(0)' : 'translateY(20px)',
                  opacity: loaded ? (hasAccess ? (mod.ready ? 1 : 0.7) : 0.4) : 0,
                  animation: loaded ? `fadeInUp 0.4s ease-out ${idx * 0.03}s both` : 'none',
                  position: 'relative',
                  border: hasAccess ? (mod.ready ? 'none' : '1px dashed #d1d5db') : '2px dashed #fca5a5',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translateY(-6px) scale(1.02)';
                  e.currentTarget.style.boxShadow = '0 12px 25px rgba(0,0,0,0.12)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'translateY(0) scale(1)';
                  e.currentTarget.style.boxShadow = '0 4px 10px rgba(0,0,0,0.06)';
                }}
              >
                {/* Badge "Bientôt" */}
                {!mod.ready && (
                  <div style={{
                    position: 'absolute', top: '0.75rem', right: '0.75rem', background: '#f59e0b', color: 'white',
                    fontSize: '0.75rem', fontWeight: 'bold', padding: '0.25rem 0.65rem', borderRadius: '1rem', zIndex: 2, boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                  }}>
                    BIENTÔT
                  </div>
                )}

                {/* Badge "Cadenas" si pas d'accès */}
                {!hasAccess && mod.ready && (
                  <div style={{
                    position: 'absolute', top: '0.75rem', right: '0.75rem', background: '#dc2626', color: 'white',
                    fontSize: '0.75rem', fontWeight: 'bold', padding: '0.25rem 0.65rem', borderRadius: '1rem', zIndex: 2, boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                  }}>
                    🔒 RESTREINT
                  </div>
                )}

                <div style={{ overflow: 'hidden', height: '170px', position: 'relative', background: '#f3f4f6' }}>
                  <img
                    src={mod.image}
                    alt={mod.name}
                    style={{
                      width: '100%', height: '100%', objectFit: 'cover',
                      filter: hasAccess ? (mod.ready ? 'none' : 'grayscale(0.6)') : 'grayscale(1)',
                    }}
                    onError={(e) => { e.target.src = '/tableau.jpg'; }}
                  />
                </div>
                <div style={{ padding: '1rem', textAlign: 'center' }}>
                  <div style={{ fontWeight: 'bold', fontSize: '1.05rem', color: '#1f2937', lineHeight: '1.3' }}>
                    {mod.name}
                  </div>
                  <div style={{
                    marginTop: '0.5rem',
                    color: hasAccess ? (mod.ready ? '#10b981' : '#9ca3af') : '#dc2626',
                    fontSize: '0.85rem',
                    fontWeight: hasAccess ? '600' : 'bold',
                  }}>
                    {hasAccess ? (mod.ready ? 'Accéder →' : 'En développement') : 'Accès restreint 🔒'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ===== NOUVEAU FOOTER (GLOBALMIND) ===== */}
      <div style={{
        marginTop: '4rem',
        background: 'rgba(6, 95, 70, 0.95)', // Vert foncé de la pharmacie
        borderRadius: '1rem',
        padding: '2rem 1.5rem',
        maxWidth: '1400px',
        width: '100%',
        margin: '4rem auto 0 auto',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.8rem',
        boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
      }}>
        
        {/* Copyright Pharmacie */}
        <div style={{ textAlign: 'center', color: '#d1d5db', fontSize: '0.85rem', fontWeight: '500' }}>
          © 2026 Pharmacie Le Frasah - Tous droits réservés
        </div>

        <hr style={{ width: '80%', border: 'none', borderTop: '1px solid rgba(255,255,255,0.15)', margin: '0.5rem 0' }} />

        {/* Développeur : GlobalMind InnoTech */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          <div style={{ background: 'white', padding: '6px 12px', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', boxShadow: '0 4px 6px rgba(0,0,0,0.2)' }}>
            <img 
              src="/globalmindlogo.png" 
              alt="GlobalMind InnoTech" 
              style={{ height: '30px', objectFit: 'contain' }}
              onError={(e) => { 
                if (e.target.src.includes('.png')) {
                  e.target.src = '/globalmindlogo.jpg'; // Fallback si l'image est en .jpg
                } else {
                  e.target.style.display = 'none';
                }
              }}
            />
          </div>
          <span style={{ color: '#ffffff', fontSize: '1rem', fontWeight: 'bold', letterSpacing: '0.5px' }}>
            Développé par GlobalMind InnoTech
          </span>
        </div>

        {/* Contacts */}
        <div style={{ 
          display: 'flex', 
          gap: '1.5rem', 
          flexWrap: 'wrap', 
          justifyContent: 'center',
          color: '#a7f3d0', // Vert clair pour contraster avec le fond
          fontSize: '0.85rem',
          marginTop: '0.5rem',
          fontWeight: '500'
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>📧 globalmindinnotech@gmail.com</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>📞 +243 819 661 838</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>📞 +243 987 170 739</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>📞 +243 976 660 311</span>
        </div>
      </div>

      {/* ===== STYLES D'ANIMATION ===== */}
      <style>{`
        @keyframes fadeInDown { from { opacity: 0; transform: translateY(-20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @media (max-width: 600px) { .home-grid { grid-template-columns: repeat(2, 1fr) !important; } }
      `}</style>
    </div>
  );
};

export default Home;