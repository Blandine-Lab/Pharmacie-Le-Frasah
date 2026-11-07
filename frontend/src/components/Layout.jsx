import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';

const Layout = () => {
  return (
    <div style={{ minHeight: '100vh', background: '#f4f6f9' }}>
      <Navbar />
      <main style={{ padding: '1rem 2rem' }}>
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
