import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore, deliveryCoord, deliveryLabel } from '../store';
import { cartItemCount, foodTotal } from '@app/domain/cart/cart.js';
import { checkServiceability, deliveryFee } from '@app/domain/delivery/delivery.js';
import { rankByStanding } from '@app/domain/moderation/moderation.js';
import { LocationPicker } from '../components/LocationPicker';
import './Home.css';

/** ★ 4.8 → 4.8 (ใช้เรียงร้านเด่นตามเรตติ้ง) */
const ratingValue = (s: string): number => parseFloat(s.replace(/[^\d.]/g, '')) || 0;

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
  const [locOpen, setLocOpen] = useState(false);
  const coord = deliveryCoord(state);

  const q = query.trim().toLowerCase();
  const matches = (name: string, cat: string) =>
    (q === '' || name.toLowerCase().includes(q)) &&
    (activeCat === null || cat === activeCat);

  // ร้านที่ถูกลดอันดับ (auto-action ADR 0006) ตกไปอยู่ท้ายลิสต์
  const byStanding = <T extends { id: string }>(items: T[]) =>
    rankByStanding(items, (it) => `merchant:${it.id}`, state.downranked);

  // ดึงจาก catalog จริง (state.restaurants) + คิดระยะ/ค่าส่ง/เวลา จากที่อยู่จัดส่งที่ปักหมุด (coord)
  const enriched = state.restaurants.map((r) => {
    const svc = checkServiceability(coord, r.coord);
    return {
      id: r.id, name: r.name, icon: r.icon, image: r.image, g: r.g, rating: r.rating, cat: r.cat, blurb: r.blurb,
      km: svc.distanceKm, fee: deliveryFee(svc.distanceKm), eta: Math.round(8 + svc.distanceKm * 4),
      offzone: !svc.orderable,
    };
  });
  const filtered = enriched.filter((c) => matches(c.name, c.cat));
  // เปิดอยู่ตอนนี้ = ร้านในเขต เรียงตามเรตติ้ง; ใกล้คุณ = ทุกร้าน เรียงตามระยะจริง
  const fStalls = byStanding([...filtered].filter((c) => !c.offzone).sort((a, b) => ratingValue(b.rating) - ratingValue(a.rating)));
  const fNear = byStanding([...filtered].sort((a, b) => a.km - b.km));
  // ร้านที่ "ส่งถึงคุณได้" จริงจากที่อยู่ที่ปักหมุด (in-zone) — ใช้แทนตัวเลขตกแต่งที่ฮาร์ดโค้ดเดิม
  const inZoneCount = enriched.filter((c) => !c.offzone).length;
  const filtering = q !== '' || activeCat !== null;
  const noResults = filtering && fStalls.length === 0 && fNear.length === 0;

  const toggleCat = (label: string) =>
    setActiveCat((c) => (c === label ? null : label));
  const clearFilters = () => { setQuery(''); setActiveCat(null); };

  return (
    <div className="home">
      <div className="topbar">
        <button className="loc" aria-label="เปลี่ยนที่อยู่จัดส่ง" onClick={() => setLocOpen(true)}>
          <span className="pin">📍</span> <b>{deliveryLabel(state)}</b> <span aria-hidden="true">▾</span>
        </button>
      </div>

      <header className="hero">
        <span className="eyebrow">{deliveryLabel(state)} · ส่งถึงคุณได้ {inZoneCount} ร้าน</span>
        <h1 className="sign">
          <span className="l1">หิวเมื่อไหร่</span>
          <span className="l2">ตลาดเปิดเมื่อนั้น</span>
        </h1>
        <span className="open-tag"><span className="dot" /> เปิดรับออเดอร์</span>
        <p className="riders">🛵 ไรเดอร์รับงานเร็วในย่านคุณ</p>
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
                  : <Link to="/all">ดูทั้งหมด</Link>}
              </div>
              <div className="hscroll">
                {fStalls.map((s) => (
                  <Link className="stall" to={`/r/${s.id}`} key={s.id}>
                    <div className={`thumb ${s.g}`}>
                      {s.image ? <img src={s.image} alt={s.name} /> : s.icon}
                    </div>
                    <h3>{s.name}</h3>
                    <div className="meta"><span className="rate">{s.rating}</span> · {s.km.toFixed(1)} กม.</div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {fNear.length > 0 && (
            <section aria-label="ร้านใกล้คุณ">
              <div className="sec-head">
                <h2>{filtering ? 'ร้านใกล้คุณ' : 'ใกล้คุณที่สุด'}</h2>
                <button type="button" className="link-btn" onClick={() => setLocOpen(true)}>ดูแผนที่</button>
              </div>
              <div className="near">
                {fNear.map((r) => (
                  <Link className="row" to={`/r/${r.id}`} key={r.id}>
                    <div className={`thumb ${r.g}`}>
                      {r.image ? <img src={r.image} alt={r.name} /> : r.icon}
                    </div>
                    <div className="info">
                      <h3>{r.name}</h3>
                      <p className="sub">{r.blurb}</p>
                      <div className="meta">
                        <span className="rate">{r.rating}</span>
                        <span>{r.eta} นาที</span>
                        <span>฿{r.fee} ค่าส่ง</span>
                        {r.offzone && <span className="offzone">นอกพื้นที่</span>}
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
          <span className="count" key={count}>{count} รายการ</span>
          <span>ดูตะกร้า</span>
          <span className="total">฿{total} ›</span>
        </Link>
      )}

      {locOpen && <LocationPicker onClose={() => setLocOpen(false)} />}
    </div>
  );
}
