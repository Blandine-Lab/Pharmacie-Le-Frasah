import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';
import Stocks from './pages/Stocks';
import Entrees from './pages/Entrees';
import AjustementsStock from './pages/AjustementsStock';
import Etiquettes from './pages/Etiquettes';
import Sorties from './pages/Sorties';
import Clients from './pages/Clients';
import Vendeurs from './pages/Vendeurs';
import Caisse from './pages/Caisse';
import Rapports from './pages/Rapports';
import Utilisateurs from './pages/Utilisateurs';
import Parametres from './pages/Parametres';
import Sauvegarde from './pages/Sauvegarde';
import Admin from './pages/Admin';

// ===== IMPORTS VAGUE 1 =====
import Fournisseurs from './pages/Fournisseurs';
import Mouvements from './pages/Mouvements';
import AlertesPeremption from './pages/AlertesPeremption';
import AlertesStock from './pages/AlertesStock';

// ===== IMPORTS VAGUE 2 =====
import Ordonnances from './pages/Ordonnances';
import CommandesFournisseurs from './pages/CommandesFournisseurs';
import Inventaire from './pages/Inventaire';
import RetoursClients from './pages/RetoursClients';

// ✅ NOUVEL IMPORT POUR LA PWA
import InstallPWA from './components/InstallPWA';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Route publique de connexion */}
          <Route path="/login" element={<Login />} />

          {/* Routes protégées avec Layout */}
          <Route element={<Layout />}>
            <Route path="/" element={
              <ProtectedRoute>
                <Home />
              </ProtectedRoute>
            } />
            <Route path="/api/dashboard" element={
              <ProtectedRoute requiredRole="dashboard">
                <Dashboard />
              </ProtectedRoute>
            } />
            <Route path="/stocks" element={
              <ProtectedRoute requiredRole="stocks">
                <Stocks />
              </ProtectedRoute>
            } />
            <Route path="/entrees" element={
              <ProtectedRoute requiredRole="stocks">
                <Entrees />
              </ProtectedRoute>
            } />
            <Route path="/ajustements" element={
              <ProtectedRoute requiredRole="stocks">
                <AjustementsStock />
              </ProtectedRoute>
            } />
            <Route path="/etiquettes" element={
              <ProtectedRoute requiredRole="stocks">
                <Etiquettes />
              </ProtectedRoute>
            } />
            <Route path="/sorties" element={
              <ProtectedRoute requiredRole="sorties">
                <Sorties />
              </ProtectedRoute>
            } />
            <Route path="/clients" element={
              <ProtectedRoute requiredRole="clients">
                <Clients />
              </ProtectedRoute>
            } />
            <Route path="/vendeurs" element={
              <ProtectedRoute requiredRole="vendeurs">
                <Vendeurs />
              </ProtectedRoute>
            } />
            <Route path="/caisse" element={
              <ProtectedRoute requiredRole="caisse">
                <Caisse />
              </ProtectedRoute>
            } />
            <Route path="/rapports" element={
              <ProtectedRoute requiredRole="rapports">
                <Rapports />
              </ProtectedRoute>
            } />
            <Route path="/utilisateurs" element={
              <ProtectedRoute requiredRole="admin">
                <Utilisateurs />
              </ProtectedRoute>
            } />
            <Route path="/parametres" element={
              <ProtectedRoute requiredRole="parametres">
                <Parametres />
              </ProtectedRoute>
            } />
            <Route path="/sauvegarde" element={
              <ProtectedRoute requiredRole="sauvegarde">
                <Sauvegarde />
              </ProtectedRoute>
            } />
            <Route path="/admin" element={
              <ProtectedRoute requiredRole="admin">
                <Admin />
              </ProtectedRoute>
            } />

            {/* ===== NOUVELLES ROUTES VAGUE 1 ===== */}
            <Route path="/fournisseurs" element={
              <ProtectedRoute requiredRole="stocks">
                <Fournisseurs />
              </ProtectedRoute>
            } />
            <Route path="/mouvements" element={
              <ProtectedRoute requiredRole="stocks">
                <Mouvements />
              </ProtectedRoute>
            } />
            <Route path="/alertes-peremption" element={
              <ProtectedRoute requiredRole="stocks">
                <AlertesPeremption />
              </ProtectedRoute>
            } />
            <Route path="/alertes-stock" element={
              <ProtectedRoute requiredRole="stocks">
                <AlertesStock />
              </ProtectedRoute>
            } />

            {/* ===== NOUVELLES ROUTES VAGUE 2 ===== */}
            <Route path="/ordonnances" element={
              <ProtectedRoute requiredRole="stocks">
                <Ordonnances />
              </ProtectedRoute>
            } />
            <Route path="/commandes" element={
              <ProtectedRoute requiredRole="stocks">
                <CommandesFournisseurs />
              </ProtectedRoute>
            } />
            <Route path="/inventaire" element={
              <ProtectedRoute requiredRole="stocks">
                <Inventaire />
              </ProtectedRoute>
            } />
            <Route path="/retours" element={
              <ProtectedRoute requiredRole="stocks">
                <RetoursClients />
              </ProtectedRoute>
            } />
          </Route>
        </Routes>
        
        {/* ✅ AJOUT DU COMPOSANT PWA ICI */}
        <InstallPWA />
        
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;