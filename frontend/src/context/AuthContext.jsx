import { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(localStorage.getItem('token'));

  useEffect(() => {
    if (token) {
      verifyToken();
    } else {
      setLoading(false);
    }
  }, [token]);

  const verifyToken = async () => {
    try {
      const response = await api.get('/auth/me');
      if (response.data.success) {
        setUser(response.data.user);
      } else {
        logout();
      }
    } catch (error) {
      logout();
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    try {
      const response = await api.post('/auth/login', { email, password });
      if (response.data.success) {
        const { token, user } = response.data;
        localStorage.setItem('token', token);
        setToken(token);
        setUser(user);
        return { success: true };
      } else {
        return { success: false, error: response.data.error };
      }
    } catch (error) {
      return { success: false, error: error.response?.data?.error || 'Erreur serveur' };
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  };

  // ===== LOGIQUE DE PERMISSION AMÉLIORÉE =====
  const hasPermission = (requiredRole) => {
    if (!user) return false;

    // 1. L'admin a toujours accès à tout (bypass)
    if (user.role === 'admin') return true;
    
    // 2. Seul l'admin peut accéder aux routes spécifiques "admin"
    if (requiredRole === 'admin') return false;

    // 3. Si des permissions personnalisées sont définies (ex: via l'onglet Utilisateurs)
    if (user.permissions && Array.isArray(user.permissions) && user.permissions.length > 0) {
      return user.permissions.includes(requiredRole);
    }

    // 4. Fallback : Permissions par défaut du rôle (si aucune permission spécifique n'est définie)
    const rolePermissions = {
      manager: [
        'dashboard', 'stocks', 'entrees', 'sorties', 'rapports', 
        'clients', 'vendeurs', 'caisse', 'parametres', 'sauvegarde'
      ],
      user: [
        'dashboard', 'stocks', 'sorties', 'rapports'
      ],
    };

    const allowed = rolePermissions[user.role] || [];
    return allowed.includes(requiredRole);
  };

  const value = {
    user,
    loading,
    login,
    logout,
    hasPermission,
    isAuthenticated: !!user,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};