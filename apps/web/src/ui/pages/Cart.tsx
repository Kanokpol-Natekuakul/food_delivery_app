import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { priceBreakdown, lineTotal, cartItemCount, isEmpty } from '@app/domain/cart/cart.js';
import { checkServiceability, SERVICE_ZONE_KM } from '@app/domain/delivery/delivery.js';
import { findRestaurant, CUSTOMER_LOCATION } from '../data/catalog';
import './Cart.css';

export function Cart() {
  const { state, dispatch } = useStore();
  const nav = useNavigate();
  const cart = state.cart;
  const restaurant = findRestaurant(state.restaurants, state.restaurantId ?? undefined);
  const backTo = restaurant ? `/r/${restaurant.id}` : '/';

  if (isEmpty(cart)) {
    return (
      <div className="cart">
        <Link className="cart-back" to="/">‹ กลับหน้าแรก</Link>
        <div className="empty">
          <div className="big">🛒</div>
          <p>ตะกร้ายังว่าง — ตลาดเปิดรออยู่</p>
          <Link className="btn btn--mango" to="/">ดูร้านใกล้ฉัน</Link>
        </div>
      </div>
    );
  }

  // ค่าส่ง + ขอบเขตบริการจากระยะส่งจริง (haversine ร้าน→ลูกค้า, ADR 0005); ไม่รู้ร้าน = fallback คงที่
  const service = restaurant ? checkServiceability(CUSTOMER_LOCATION, restaurant.coord) : undefined;
  const distanceKm = service?.distanceKm;
  const fee = service?.orderable ? service.fee : undefined;
  const offZone = service !== undefined && !service.orderable;
  const b = priceBreakdown(cart, fee);
  const placeOrder = () => {
    if (offZone) return; // ร้านนอกเขต — สั่งไม่ได้
    dispatch({ type: 'place' });
    nav('/track');
  };

  return (
    <div className="cart">
      <Link className="cart-back" to={backTo}>‹ เลือกเพิ่ม</Link>
      <h1 className="cart-title">ตะกร้าของคุณ</h1>
      {restaurant && <p className="cart-shop">🏪 {restaurant.name}</p>}

      <div className="lines">
        {cart.lines.map((l) => (
          <div className="line" key={l.id}>
            <div className="line-main">
              <div className="line-name">{l.itemName}</div>
              <div className="line-opts">{[l.spice, ...l.options.map((o) => o.label)].join(' · ')}</div>
              {l.note && <div className="line-note">“{l.note}”</div>}
              <button className="line-remove" onClick={() => dispatch({ type: 'remove', id: l.id })}>ลบ</button>
            </div>
            <div className="line-right">
              <div className="line-qty">
                <button onClick={() => dispatch({ type: 'qty', id: l.id, qty: l.qty - 1 })} aria-label="ลด">−</button>
                <span>{l.qty}</span>
                <button onClick={() => dispatch({ type: 'qty', id: l.id, qty: l.qty + 1 })} aria-label="เพิ่ม">+</button>
              </div>
              <div className="line-total">฿{lineTotal(l)}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="summary">
        <div className="srow"><span>ค่าอาหาร</span><span>฿{b.food}</span></div>
        <div className="srow">
          <span>ค่าส่ง{distanceKm !== undefined && <em className="srow-note"> · {distanceKm.toFixed(1)} กม.</em>}</span>
          <span>฿{b.delivery}</span>
        </div>
        <div className="srow"><span>ค่าบริการ</span><span>฿{b.service}</span></div>
        <div className="srow srow--total"><span>รวมทั้งหมด</span><span>฿{b.total}</span></div>
      </div>

      <div className="placebar">
        {offZone ? (
          <button className="btn btn--ghost" disabled>
            <span>ร้านนอกพื้นที่จัดส่ง · ส่งในรัศมี {SERVICE_ZONE_KM} กม.</span>
          </button>
        ) : (
          <button className="btn btn--chili" onClick={placeOrder}>
            <span>สั่งเลย · {cartItemCount(cart)} รายการ</span>
            <span className="total">฿{b.total}</span>
          </button>
        )}
      </div>
    </div>
  );
}
