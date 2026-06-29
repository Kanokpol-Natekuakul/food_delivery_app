import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store';
import { cartItemCount, foodTotal } from '@app/domain/cart/cart.js';
import { checkServiceability } from '@app/domain/delivery/delivery.js';
import { rankByStanding } from '@app/domain/moderation/moderation.js';
import { findRestaurant, CUSTOMER_LOCATION } from '../data/catalog';
import type { Restaurant } from '../data/catalog';
import './Home.css';

/** ร้านนี้อยู่นอกพื้นที่จัดส่งไหม (คิดจากพิกัดร้านใน store) */
const isOffZone = (list: readonly Restaurant[], id: string): boolean => {
  const r = findRestaurant(list, id);
  return r ? !checkServiceability(CUSTOMER_LOCATION, r.coord).orderable : false;
};

const stalls = [
  { id: 'khao-man-kai', g: 'g1', icon: '🍗', name: 'ข้าวมันไก่ตำนาน', cat: 'ข้าวมันไก่', meta: '★ 4.8', sub: '12 นาที · 1.2 กม.', tag: 'ของเด็ด' },
  { id: 'kuaytiao-ruea', g: 'g2', icon: '🍜', name: 'ก๋วยเตี๋ยวเรือป้านิด', cat: 'ก๋วยเตี๋ยว', meta: '★ 4.7', sub: '18 นาที · 2.0 กม.' },
  { id: 'cha-maimuk', g: 'g4', icon: '🧋', name: 'ชาไข่มุกซอย 5', cat: 'เครื่องดื่ม', meta: '★ 4.9', sub: '9 นาที · 0.6 กม.' },
  { id: 'somtam', g: 'g3', icon: '🥗', name: 'ส้มตำแซ่บนัว', cat: 'อีสาน', meta: '★ 4.6', sub: '22 นาที · 2.4 กม.' },
];

const near = [
  { id: 'cha-maimuk', g: 'g4', icon: '🧋', name: 'ชาไข่มุกซอย 5', cat: 'เครื่องดื่ม', sub: 'เครื่องดื่ม · ของหวาน', meta: ['★ 4.9', '9 นาที', '฿15 ค่าส่ง'] },
  { id: 'khao-man-kai', g: 'g1', icon: '🍗', name: 'ข้าวมันไก่ตำนาน', cat: 'ข้าวมันไก่', sub: 'ข้าว · ตามสั่ง', meta: ['★ 4.8', '12 นาที', '฿20 ค่าส่ง'] },
  { id: 'moo-ping', g: 'g5', icon: '🍢', name: 'หมูปิ้งเจ๊แดง', cat: 'อีสาน', sub: 'ของกินเล่น', meta: ['★ 4.7', '14 นาที', '฿18 ค่าส่ง'] },
  { id: 'tom-lueat-moo', g: 'g6', icon: '🍲', name: 'ต้มเลือดหมูเฮียชาญ', cat: 'ก๋วยเตี๋ยว', sub: 'ก๋วยเตี๋ยว', meta: ['★ 4.5'], closed: 'เปิด 17:00' },
  { id: 'khao-tom-rung', g: 'g2', icon: '🍚', name: 'ข้าวต้มโต้รุ่งเฮียอ้วน', cat: 'ตามสั่ง', sub: 'ตามสั่ง · โต้รุ่ง', meta: ['★ 4.6', 'เปิดดึก'] },
];

const cats = [
  ['🍜', 'ก๋วยเตี๋ยว'], ['🍚', 'ตามสั่ง'], ['🍗', 'ข้าวมันไก่'],
  ['🥘', 'อีสาน'], ['🧋', 'เครื่องดื่ม'], ['🍧', 'ของหวาน'],
] as const;

export function Home() {
  const { state } = useStore();
  const count = cartItemCount(state.cart);
  const total = foodTotal(state.cart);

  const [query, setQuery] = useState('');
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const q = query.trim().toLowerCase();
  const matches = (name: string, cat: string) =>
    (q === '' || name.toLowerCase().includes(q)) &&
    (activeCat === null || cat === activeCat);

  // ร้านที่ถูกลดอันดับ (auto-action ADR 0006) ตกไปอยู่ท้ายลิสต์
  const byStanding = <T extends { id: string }>(items: T[]) =>
    rankByStanding(items, (it) => `merchant:${it.id}`, state.downranked);
  const fStalls = byStanding(stalls.filter((s) => matches(s.name, s.cat)));
  const fNear = byStanding(near.filter((r) => matches(r.name, r.cat)));
  const filtering = q !== '' || activeCat !== null;
  const noResults = filtering && fStalls.length === 0 && fNear.length === 0;

  const toggleCat = (label: string) =>
    setActiveCat((c) => (c === label ? null : label));
  const clearFilters = () => { setQuery(''); setActiveCat(null); };

  return (
    <div className="home">
      <div className="topbar">
        <button className="loc" aria-label="เปลี่ยนที่อยู่จัดส่ง">
          <span className="pin">📍</span> <b>ลาดพร้าว ซ.1</b> <span aria-hidden="true">▾</span>
        </button>
        <span className="spacer" />
        <button className="icon-btn" aria-label="เปิดเมนู" aria-expanded={menuOpen}
          onClick={() => setMenuOpen(true)}>☰</button>
      </div>

      <header className="hero">
        <span className="eyebrow">ลาดพร้าว · ค่ำนี้เปิดอยู่ 23 ร้าน</span>
        <h1 className="sign">
          <span className="l1">หิวเมื่อไหร่</span>
          <span className="l2">ตลาดเปิดเมื่อนั้น</span>
        </h1>
        <span className="open-tag"><span className="dot" /> เปิดรับออเดอร์</span>
        <p className="riders">🛵 ไรเดอร์ว่างใกล้คุณ <b>12</b> คน — รับงานเร็ว</p>
      </header>

      <form className="search" role="search" onSubmit={(e) => e.preventDefault()}>
        <span aria-hidden="true">🔍</span>
        <input type="search" placeholder="ค้นหาเมนูหรือร้าน..." aria-label="ค้นหาเมนูหรือร้าน"
          value={query} onChange={(e) => setQuery(e.target.value)} />
        {query && (
          <button type="button" className="search-clear" aria-label="ล้างคำค้นหา"
            onClick={() => setQuery('')}>✕</button>
        )}
      </form>

      <nav className="cats hscroll" aria-label="หมวดหมู่อาหาร">
        {cats.map(([ic, label]) => (
          <button className={`cat${activeCat === label ? ' is-active' : ''}`} key={label}
            aria-pressed={activeCat === label} onClick={() => toggleCat(label)}>
            <span className="ic">{ic}</span><span>{label}</span>
          </button>
        ))}
      </nav>

      {noResults ? (
        <section className="no-results">
          <div className="big">🔍</div>
          <p>ไม่พบร้านที่ตรงกับ{q && <> “<b>{query}</b>”</>}{activeCat && <> ในหมวด <b>{activeCat}</b></>}</p>
          <button className="btn btn--mango" onClick={clearFilters}>ล้างตัวกรอง</button>
        </section>
      ) : (
        <>
          {fStalls.length > 0 && (
            <section className="stalls">
              <div className="sec-head">
                <h2>{filtering ? 'ผลการค้นหา' : 'เปิดอยู่ตอนนี้'}</h2>
                {filtering
                  ? <a href="#" onClick={(e) => { e.preventDefault(); clearFilters(); }}>ล้างตัวกรอง</a>
                  : <a href="#" onClick={(e) => e.preventDefault()}>ดูทั้งหมด</a>}
              </div>
              <div className="hscroll">
                {fStalls.map((s) => (
                  <Link className="stall" to={`/r/${s.id}`} key={s.name}>
                    <div className={`thumb ${s.g}`}>{s.icon}{s.tag && <span className="tag">{s.tag}</span>}</div>
                    <h3>{s.name}</h3>
                    <div className="meta"><span className="rate">{s.meta}</span> · {s.sub}</div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {fNear.length > 0 && (
            <section aria-label="ร้านใกล้คุณ">
              <div className="sec-head">
                <h2>{filtering ? 'ร้านใกล้คุณ' : 'ใกล้คุณที่สุด'}</h2>
                <a href="#" onClick={(e) => e.preventDefault()}>ดูแผนที่</a>
              </div>
              <div className="near">
                {fNear.map((r) => (
                  <Link className="row" to={`/r/${r.id}`} key={r.name}>
                    <div className={`thumb ${r.g}`}>{r.icon}</div>
                    <div className="info">
                      <h3>{r.name}</h3>
                      <p className="sub">{r.sub}</p>
                      <div className="meta">
                        {r.meta.map((m, i) => <span className={i === 0 ? 'rate' : undefined} key={i}>{m}</span>)}
                        {r.closed && <span className="closed">{r.closed}</span>}
                        {isOffZone(state.restaurants, r.id) && <span className="offzone">นอกพื้นที่</span>}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {count > 0 && (
        <Link className="cartbar" to="/cart">
          <span className="count">{count} รายการ</span>
          <span>ดูตะกร้า</span>
          <span className="total">฿{total} ›</span>
        </Link>
      )}

      {menuOpen && (
        <div className="drawer-scrim" onClick={() => setMenuOpen(false)}>
          <aside className="drawer" role="dialog" aria-label="เมนูหลัก" onClick={(e) => e.stopPropagation()}>
            <div className="drawer__head">
              <div className="drawer__who">
                <span className="drawer__avatar">😋</span>
                <div>
                  <b>สวัสดี, หิวแล้ว</b>
                  <span className="drawer__loc">📍 ลาดพร้าว ซ.1</span>
                </div>
              </div>
              <button className="icon-btn" aria-label="ปิดเมนู" onClick={() => setMenuOpen(false)}>✕</button>
            </div>
            <nav className="drawer__nav" onClick={() => setMenuOpen(false)}>
              <Link to="/"><span className="di">🏠</span> หน้าแรก</Link>
              <Link to="/"><span className="di">🍽️</span> ร้านอาหารทั้งหมด</Link>
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
      )}
    </div>
  );
}
