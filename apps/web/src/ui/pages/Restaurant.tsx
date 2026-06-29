import { Link, useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../store';
import { cartItemCount, foodTotal } from '@app/domain/cart/cart.js';
import { checkServiceability, SERVICE_ZONE_KM } from '@app/domain/delivery/delivery.js';
import { findRestaurant, CUSTOMER_LOCATION } from '../data/catalog';
import './Restaurant.css';

export function Restaurant() {
  const { restaurantId } = useParams();
  const nav = useNavigate();
  const { state } = useStore();
  const r = findRestaurant(state.restaurants, restaurantId);

  const count = cartItemCount(state.cart);
  const total = foodTotal(state.cart);

  if (!r) {
    return (
      <div className="resto resto--missing">
        <div className="empty">
          <div className="big">🏪</div>
          <p>ไม่พบร้านนี้แล้ว</p>
          <Link className="btn btn--mango" to="/">กลับหน้าแรก</Link>
        </div>
      </div>
    );
  }

  // นอกเขตบริการ = สั่งไม่ได้ (ADR 0005); คิดจากระยะร้าน→ลูกค้าในโดเมน
  const service = checkServiceability(CUSTOMER_LOCATION, r.coord);
  const blocked = !service.orderable;

  return (
    <div className="resto">
      <div className={`resto-hero ${r.g}`}>
        <button className="back" aria-label="ย้อนกลับ" onClick={() => nav('/')}>‹</button>
        <span className="resto-icon">{r.icon}</span>
      </div>

      <div className="resto-body">
        <header className="resto-head">
          <span className="resto-cat">{r.cat}</span>
          <h1 className="resto-name">{r.name}</h1>
          <div className="resto-meta"><span className="rate">{r.rating}</span> · เปิดอยู่ · ส่งโดยไรเดอร์ใกล้คุณ</div>
          <p className="resto-blurb">{r.blurb}</p>
        </header>

        {blocked && (
          <div className="resto-offzone" role="status">
            <span className="resto-offzone__icon" aria-hidden="true">🛵</span>
            <div className="resto-offzone__text">
              <b>ร้านนี้อยู่นอกพื้นที่จัดส่ง</b>
              <span>ห่าง {service.distanceKm.toFixed(1)} กม. · ส่งได้ในรัศมี {SERVICE_ZONE_KM} กม. — ดูเมนูได้ แต่ยังสั่งไม่ได้</span>
            </div>
          </div>
        )}

        <h2 className="resto-sec">เมนูแนะนำ</h2>
        <div className="dishes">
          {r.dishes.map((d) =>
            blocked ? (
              <div className="dish-row dish-row--off" key={d.id} aria-disabled="true">
                <div className="dish-info">
                  <h3>{d.name}</h3>
                  <p className="dish-desc">{d.desc}</p>
                  <span className="dish-price">฿{d.basePrice}</span>
                </div>
                <div className={`dish-thumb ${r.g}`}>{d.icon}</div>
              </div>
            ) : (
              <Link className="dish-row" to={`/r/${r.id}/${d.id}`} key={d.id}>
                <div className="dish-info">
                  <h3>{d.name}</h3>
                  <p className="dish-desc">{d.desc}</p>
                  <span className="dish-price">฿{d.basePrice}</span>
                </div>
                <div className={`dish-thumb ${r.g}`}>
                  {d.icon}
                  <span className="dish-add" aria-hidden="true">＋</span>
                </div>
              </Link>
            ),
          )}
        </div>
      </div>

      {count > 0 && (
        <Link className="cartbar" to="/cart">
          <span className="count">{count} รายการ</span>
          <span>ดูตะกร้า</span>
          <span className="total">฿{total} ›</span>
        </Link>
      )}
    </div>
  );
}
