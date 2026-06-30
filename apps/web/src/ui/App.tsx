import { Routes, Route, Link } from 'react-router-dom';
import { useStore } from './store';
import './App.css';
import { Home } from './pages/Home';
import { Restaurant } from './pages/Restaurant';
import { Menu } from './pages/Menu';
import { Cart } from './pages/Cart';
import { Track } from './pages/Track';
import { Merchant } from './pages/Merchant';
import { MerchantMenu } from './pages/MerchantMenu';
import { MerchantRate } from './pages/MerchantRate';
import { Rider } from './pages/Rider';
import { Admin } from './pages/Admin';
import { Login } from './pages/Login';

/** แถบบนสุด: สถานะล็อกอิน (ตัวตนจาก Lucia session) + ลิงก์เข้า/ออกระบบ */
function AuthBar() {
  const { state, logout } = useStore();
  return (
    <div className="authbar">
      {state.auth ? (
        <>
          <span className="authbar-who" data-testid="authbar-user">{state.auth.actorId}</span>
          <button className="authbar-link" onClick={() => { void logout(); }}>ออกจากระบบ</button>
        </>
      ) : (
        <Link className="authbar-link" to="/login">เข้าสู่ระบบ</Link>
      )}
    </div>
  );
}

export function App() {
  return (
    <>
      <AuthBar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/r/:restaurantId" element={<Restaurant />} />
        <Route path="/r/:restaurantId/:dishId" element={<Menu />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/track" element={<Track />} />
        <Route path="/merchant" element={<Merchant />} />
        <Route path="/merchant/menu" element={<MerchantMenu />} />
        <Route path="/merchant/rate" element={<MerchantRate />} />
        <Route path="/rider" element={<Rider />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/login" element={<Login />} />
      </Routes>
    </>
  );
}
