import { useEffect } from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import { useStore } from './store';
import './App.css';

/** แถบแจ้งผู้ใช้ชั่วคราว (mirror ไป backend ล้ม เช่น ต้องล็อกอิน) — ปิดเองใน 4 วิ หรือกดปิด */
function Notice() {
  const { state, dispatch } = useStore();
  useEffect(() => {
    if (!state.notice) return;
    const id = setTimeout(() => dispatch({ type: 'setNotice', text: null }), 4000);
    return () => clearTimeout(id);
  }, [state.notice, dispatch]);
  if (!state.notice) return null;
  return (
    <div className="notice" role="alert" data-testid="notice">
      <span>⚠️ {state.notice}</span>
      <button className="notice-x" aria-label="ปิดการแจ้งเตือน" onClick={() => dispatch({ type: 'setNotice', text: null })}>✕</button>
    </div>
  );
}
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
import { AllRestaurants } from './pages/AllRestaurants';

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
  // เดสก์ท็อป: หมุน wheel แนวตั้งเหนือแถวเลื่อนแนวนอน (.hscroll) → เลื่อนแนวนอนแทน
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.('.hscroll') as HTMLElement | null;
      if (!el || e.deltaY === 0 || el.scrollWidth <= el.clientWidth) return;
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, []);

  return (
    <>
      <AuthBar />
      <Notice />
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
        <Route path="/all" element={<AllRestaurants />} />
      </Routes>
    </>
  );
}
