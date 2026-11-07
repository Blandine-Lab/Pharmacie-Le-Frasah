import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Couleurs pharmacie
const PRIMARY = '#065f46';
const ACCENT = '#10b981';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const videoRef = useRef(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await login(email, password);
    if (result.success) {
      navigate('/api/dashboard');
    } else {
      setError(result.error || 'Identifiants incorrects');
    }
    setLoading(false);
  };

  return (
    <div style={{
      position: 'relative',
      width: '100%', // ✅ Modification : 100% au lieu de 100vw
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: '#0a1a12',
      overflowX: 'hidden', // ✅ Empêche le défilement horizontal
      boxSizing: 'border-box',
    }}>
      {/* ===== VIDÉO DE FOND ===== */}
      <video
        ref={videoRef}
        autoPlay
        loop
        muted
        playsInline
        style={{
          position: 'absolute',
          top: 0, left: 0, width: '100%', height: '100%',
          objectFit: 'cover',
          zIndex: 0,
        }}
        onError={() => {
          if (videoRef.current) videoRef.current.style.display = 'none';
        }}
      >
        <source src="/loging.mp4" type="video/mp4" />
        <source src="/loging.webm" type="video/webm" />
        <source src="/loging.ogg" type="video/ogg" />
      </video>

      {/* Overlay sombre */}
      <div style={{
        position: 'absolute',
        top: 0, left: 0, width: '100%', height: '100%',
        background: 'rgba(0,0,0,0.65)',
        zIndex: 1,
      }} />

      {/* ===== CONTENU CENTRAL (Titre + Formulaire) ===== */}
      <div style={{
        position: 'relative',
        zIndex: 2,
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '2rem 1.5rem', // ✅ Ajout de padding sur les côtés
        width: '100%',
        boxSizing: 'border-box',
      }}>
        
        {/* TITRE GÉANT MODERNE */}
        <div style={{
          textAlign: 'center',
          marginBottom: '2.5rem',
          animation: 'fadeInDown 0.8s ease-out',
          width: '100%',
        }}>
          <h1 style={{
            fontSize: 'clamp(2.2rem, 6vw, 3.8rem)',
            fontWeight: '900',
            margin: 0,
            color: '#ffffff',
            textShadow: '0 4px 20px rgba(0,0,0,0.8), 0 2px 4px rgba(0,0,0,0.5)',
            letterSpacing: '1px',
            lineHeight: '1.2',
          }}>
            Gestion de la Pharmacie <br />
            <span style={{
              background: 'linear-gradient(135deg, #34d399, #10b981)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              display: 'inline-block',
              marginTop: '0.5rem',
            }}>
              Le Frasah
            </span>
          </h1>
          <p style={{
            color: '#d1d5db',
            fontSize: 'clamp(1rem, 2vw, 1.2rem)',
            marginTop: '1rem',
            fontWeight: '500',
            letterSpacing: '0.5px',
          }}>
            Votre santé, notre priorité
          </p>
        </div>

        {/* FORMULAIRE DE CONNEXION */}
        <form onSubmit={handleSubmit} style={{
          background: 'rgba(255,255,255,0.98)',
          padding: '2.5rem 2rem',
          borderRadius: '1.5rem',
          boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
          width: '100%',           // ✅ Prend la place dispo...
          maxWidth: '400px',       // ✅ ...mais limitée à 400px
          animation: 'fadeInUp 0.8s ease-out',
          borderTop: `5px solid ${ACCENT}`,
          boxSizing: 'border-box', // ✅ Assure que le padding est inclus dans la largeur
        }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{ 
              width: '80px', height: '80px', margin: '0 auto 1rem auto', 
              borderRadius: '50%', background: '#f0fdf4', display: 'flex', 
              justifyContent: 'center', alignItems: 'center',
              boxShadow: '0 4px 10px rgba(16, 185, 129, 0.2)'
            }}>
              <img
                src="/logo.jpeg"
                alt="Pharmacie Le Frasah"
                style={{ height: '55px', borderRadius: '0.4rem' }}
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            </div>
            <h2 style={{ color: PRIMARY, margin: 0, fontSize: '1.5rem', fontWeight: '800' }}>
              Connexion
            </h2>
            <p style={{ color: '#6b7280', margin: '0.4rem 0 0 0', fontSize: '0.9rem' }}>
              Accédez à votre espace de travail
            </p>
          </div>

          {error && (
            <div style={{
              padding: '0.75rem', borderRadius: '0.5rem', marginBottom: '1.5rem',
              background: '#fef2f2', color: '#991b1b', fontSize: '0.85rem',
              textAlign: 'center', border: '1px solid #fecaca', fontWeight: 'bold'
            }}>
              ⚠️ {typeof error === 'string' ? error : error?.message || 'Identifiants incorrects'}
            </div>
          )}

          <div style={{ marginBottom: '1.2rem' }}>
            <label style={{ display: 'block', fontWeight: '700', marginBottom: '0.4rem', color: '#374151', fontSize: '0.85rem' }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="admin@pharmacie.fr"
              style={{
                width: '100%', padding: '0.75rem 1rem', borderRadius: '0.75rem',
                border: '2px solid #e5e7eb', color: '#1f2937', fontSize: '0.95rem',
                outline: 'none', background: '#f9fafb', transition: 'all 0.2s',
                boxSizing: 'border-box', // ✅ Ajouté pour que le padding ne fasse pas déborder l'input
              }}
              onFocus={(e) => { e.target.style.borderColor = ACCENT; e.target.style.background = '#fff'; }}
              onBlur={(e) => { e.target.style.borderColor = '#e5e7eb'; e.target.style.background = '#f9fafb'; }}
            />
          </div>

          <div style={{ marginBottom: '1.8rem' }}>
            <label style={{ display: 'block', fontWeight: '700', marginBottom: '0.4rem', color: '#374151', fontSize: '0.85rem' }}>Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              style={{
                width: '100%', padding: '0.75rem 1rem', borderRadius: '0.75rem',
                border: '2px solid #e5e7eb', color: '#1f2937', fontSize: '0.95rem',
                outline: 'none', background: '#f9fafb', transition: 'all 0.2s',
                boxSizing: 'border-box', // ✅ Ajouté pour que le padding ne fasse pas déborder l'input
              }}
              onFocus={(e) => { e.target.style.borderColor = ACCENT; e.target.style.background = '#fff'; }}
              onBlur={(e) => { e.target.style.borderColor = '#e5e7eb'; e.target.style.background = '#f9fafb'; }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '0.85rem', background: PRIMARY, color: 'white',
              border: 'none', borderRadius: '0.75rem', fontSize: '1.05rem',
              fontWeight: '700', cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1, transition: 'all 0.2s',
              boxShadow: '0 4px 12px rgba(6, 95, 70, 0.3)',
              boxSizing: 'border-box',
            }}
            onMouseEnter={(e) => { if(!loading) { e.currentTarget.style.background = ACCENT; e.currentTarget.style.transform = 'translateY(-2px)'; } }}
            onMouseLeave={(e) => { if(!loading) { e.currentTarget.style.background = PRIMARY; e.currentTarget.style.transform = 'translateY(0)'; } }}
          >
            {loading ? '⏳ Connexion...' : '🔐 Se connecter'}
          </button>

          <div style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.8rem', color: '#9ca3af', fontWeight: '500' }}>
            Contactez l'administrateur pour vos identifiants.
          </div>
        </form>
      </div>

      {/* ===== FOOTER GLOBALMIND ===== */}
      <div style={{
        position: 'relative',
        zIndex: 2,
        background: 'rgba(0,0,0,0.8)',
        backdropFilter: 'blur(10px)',
        padding: '1rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        borderTop: '1px solid rgba(255,255,255,0.1)',
        textAlign: 'center',
        gap: '0.5rem',
        width: '100%',
        boxSizing: 'border-box',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          {/* Logo GlobalMind */}
          <img 
            src="/globalmindlogo.png" 
            alt="GlobalMind InnoTech" 
            style={{ height: '30px', objectFit: 'contain' }}
            onError={(e) => { 
              if (e.target.src.includes('.png')) {
                e.target.src = '/globalmindlogo.jpg';
              } else {
                e.target.style.display = 'none';
              }
            }}
          />
          <span style={{ color: '#e5e7eb', fontSize: '0.85rem', fontWeight: '600' }}>
            Développé par GlobalMind InnoTech
          </span>
        </div>
        
        <div style={{ 
          display: 'flex', 
          gap: '1rem', 
          flexWrap: 'wrap', 
          justifyContent: 'center',
          color: '#9ca3af', 
          fontSize: '0.75rem' 
        }}>
          <span>📧 globalmindinnotech@gmail.com</span>
          <span>📞 +243 819 661 838</span>
          <span>📞 +243 987 170 739</span>
          <span>📞 +243 976 660 311</span>
        </div>
      </div>

      {/* ===== STYLES D'ANIMATION ===== */}
      <style>{`
        @keyframes fadeInDown {
          from { opacity: 0; transform: translateY(-30px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default Login;