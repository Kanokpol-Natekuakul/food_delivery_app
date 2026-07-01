import { useEffect, useState } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { useStore, deliveryLabel } from './store';
import type { State } from './store';
import { cartItemCount } from '@app/domain/cart/cart.js';
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

/** แถบบนสุด: สถานะล็อกอิน (ตัวตนจาก Lucia session) + ลิงก์เข้า/ออกระบบ + ปุ่มแฮมเบอร์เกอร์เมนู */
function AuthBar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { state, logout } = useStore();
  return (
    <div className="authbar">
      <button className="icon-btn authbar-menu" aria-label="เปิดเมนู" onClick={onOpenMenu}>☰</button>
      <span style={{ flex: 1 }} />
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

/** แถบโหลดบางบนสุด — โชว์ตอนดึงข้อมูลสดจาก backend (hydrate); delay 250ms กันกระพริบตอนโหลดเร็ว */
function LoadingBar() {
  const { hydrating } = useStore();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!hydrating) { setVisible(false); return; }
    const id = setTimeout(() => setVisible(true), 250);
    return () => clearTimeout(id);
  }, [hydrating]);
  if (!visible) return null;
  return (
    <div className="loadbar" role="progressbar" aria-label="กำลังอัปเดตข้อมูล" aria-busy="true"><span /></div>
  );
}

const BRAND = 'ตลาดเปิดเมื่อนั้น';

const PAGE_TITLES: Record<string, string> = {
  '/all': 'ร้านอาหารทั้งหมด',
  '/cart': 'ตะกร้า',
  '/track': 'ติดตามออเดอร์',
  '/merchant': 'คอนโซลร้าน',
  '/merchant/menu': 'จัดการเมนู',
  '/merchant/rate': 'อัตราคอมมิชชัน',
  '/rider': 'คอนโซลไรเดอร์',
  '/admin': 'ผู้ดูแลระบบ',
  '/login': 'เข้าสู่ระบบ',
};

/** ชื่อหน้าจาก path (null = หน้าแรก → ใช้แบรนด์ล้วน) */
function pageTitle(pathname: string, restaurants: State['restaurants']): string | null {
  if (pathname === '/') return null;
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  // /r/:id (หน้าร้าน) หรือ /r/:id/:dishId (หน้าเมนู) → ชื่อร้าน / ชื่อเมนู · ชื่อร้าน
  const m = pathname.match(/^\/r\/([^/]+)(?:\/([^/]+))?$/);
  if (m) {
    const r = restaurants.find((x) => x.id === m[1]);
    if (!r) return 'ร้านอาหาร';
    const dish = m[2] ? r.dishes.find((d) => d.id === m[2]) : undefined;
    return dish ? `${dish.name} · ${r.name}` : r.name;
  }
  return null;
}

/** ตั้งชื่อแท็บเบราว์เซอร์ตามหน้า (แก้ #3: เดิม index.html ตั้ง <title> ตายตัวทุกหน้า) */
function DocumentTitle() {
  const { pathname } = useLocation();
  const { state } = useStore();
  useEffect(() => {
    const page = pageTitle(pathname, state.restaurants);
    document.title = page ? `${page} · ${BRAND}` : BRAND;
  }, [pathname, state.restaurants]);
  return null;
}

export function App() {
  const [menuOpen, setMenuOpen] = useState(false);

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
      <LoadingBar />
      <DocumentTitle />
      <AuthBar onOpenMenu={() => setMenuOpen(true)} />
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
      <GlobalDrawer menuOpen={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  );
}

interface GlobalDrawerProps {
  menuOpen: boolean;
  onClose: () => void;
}

function GlobalDrawer({ menuOpen, onClose }: GlobalDrawerProps) {
  const { state } = useStore();
  const count = cartItemCount(state.cart);

  if (!menuOpen) return null;

  return (
    <div className="drawer-scrim" onClick={onClose}>
      <aside className="drawer" role="dialog" aria-label="เมนูหลัก" onClick={(e) => e.stopPropagation()}>
        <div className="drawer__head">
          <div className="drawer__who">
            <span className="drawer__avatar">😋</span>
            <div>
              <b>สวัสดี, หิวแล้ว</b>
              <span className="drawer__loc">📍 {deliveryLabel(state)}</span>
            </div>
          </div>
          <button className="icon-btn" aria-label="ปิดเมนู" onClick={onClose}>✕</button>
        </div>
        <nav className="drawer__nav" onClick={onClose}>
          <Link to="/"><span className="di">🏠</span> หน้าแรก</Link>
          <Link to="/all"><span className="di">🍽️</span> ร้านอาหารทั้งหมด</Link>
          <Link to="/cart">
            <span className="di">🛒</span> ตะกร้า
            {count > 0 && <span className="drawer__badge">{count}</span>}
          </Link>
          <Link to="/track"><span className="di">📦</span> ติดตามออเดอร์</Link>
          <Link to="/merchant"><span className="di">🏪</span> คอนโซลร้าน (Merchant)</Link>
          <Link to="/rider"><span className="di">🛵</span> คอนโซลไรเดอร์ (Rider)</Link>
          <Link to="/admin"><span className="di">🛠</span> ผู้ดูแลระบบ (Admin)</Link>
        </nav>
      </aside>
    </div>
  );
}
