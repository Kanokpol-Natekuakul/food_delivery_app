import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useStore, deliveryCoord } from '../store';
import type { OrderLine } from '@app/domain/cart/cart.js';
import { tryAddLine } from '@app/domain/cart/cart.js';
import { checkServiceability, SERVICE_ZONE_KM } from '@app/domain/delivery/delivery.js';
import { findDish, findRestaurant } from '../data/catalog';
import type { Dish, Restaurant } from '../data/catalog';
import './Menu.css';
import { IconUtensils } from '../components/Icons';

export function Menu() {
  const { restaurantId, dishId } = useParams();
  const { state } = useStore();
  const found = findDish(state.restaurants, restaurantId, dishId);

  if (!found) {
    return (
      <div className="menu menu--missing">
        <div className="empty">
          <div className="big" style={{ display: 'inline-flex', justifyContent: 'center' }}><IconUtensils size={48} /></div>
          <p>ไม่พบเมนูนี้แล้ว</p>
          <Link className="btn btn--mango" to="/">กลับหน้าแรก</Link>
        </div>
      </div>
    );
  }
  // key ด้วย dish.id เพื่อรีเซ็ตตัวเลือก/จำนวนเมื่อสลับเมนู
  return <DishCustomize key={found.dish.id} restaurant={found.restaurant} dish={found.dish} />;
}

function DishCustomize({ restaurant, dish }: { restaurant: Restaurant; dish: Dish }) {
  const nav = useNavigate();
  const { state, dispatch } = useStore();
  const extras = dish.extras ?? [];
  const [choice, setChoice] = useState(dish.choice?.options[0] ?? '');
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');

  const blocked = !checkServiceability(deliveryCoord(state), restaurant.coord).orderable;
  const each = dish.basePrice + extras.filter((e) => picked.has(e.id)).reduce((s, e) => s + e.price, 0);
  const total = each * qty;
  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  const addToCart = () => {
    if (blocked) return; // นอกเขตบริการ — กันไว้อีกชั้นแม้ปุ่มถูก disable
    const line: OrderLine = {
      id: crypto.randomUUID(),
      itemName: dish.name,
      basePrice: dish.basePrice,
      spice: choice,
      options: extras.filter((e) => picked.has(e.id)).map((e) => ({ label: e.label, price: e.price })),
      qty,
      note: note.trim(),
    };
    const res = tryAddLine(state.cart, state.restaurantId, restaurant.id, line);
    if (res.status === 'switch') {
      const fromName = findRestaurant(state.restaurants, res.from)?.name ?? 'ร้านเดิม';
      const ok = window.confirm(
        `ตะกร้ามีของจาก "${fromName}" อยู่\nเริ่มตะกร้าใหม่จาก "${restaurant.name}" ไหม? (ของเดิมจะถูกล้าง)`,
      );
      if (!ok) return;
      dispatch({ type: 'startNewCart', line, restaurantId: restaurant.id });
    } else {
      dispatch({ type: 'add', line, restaurantId: restaurant.id });
    }
    nav('/cart');
  };

  return (
    <div className="menu">
      <div className={`dish ${restaurant.g}`}>
        {dish.icon}
        <button className="back" aria-label="ย้อนกลับ" onClick={() => nav(`/r/${restaurant.id}`)}>‹</button>
      </div>

      <div className="body">
        <div className="item-head">
          <div className="shop">{restaurant.name} · {restaurant.rating}</div>
          <h1 className="item-name">{dish.name}</h1>
          <span className="price-base">฿{dish.basePrice}</span>
          <p className="desc">{dish.desc}</p>
        </div>

        <hr />

        {dish.choice && (
          <fieldset className="group group--single">
            <div className="group-head">
              <h2>{dish.choice.label}</h2><span className="chip chip--mango">เลือก 1</span><span className="req">จำเป็น</span>
            </div>
            {dish.choice.options.map((s) => (
              <label className="opt" key={s}>
                <input type="radio" name="choice" checked={choice === s} onChange={() => setChoice(s)} />
                <span className="ind" /><span className="name">{s}</span>
              </label>
            ))}
          </fieldset>
        )}

        {extras.length > 0 && (
          <fieldset className="group group--multi">
            <div className="group-head"><h2>เพิ่มเติม</h2><span className="chip">เลือกได้หลายอย่าง</span></div>
            {extras.map((e) => (
              <label className="opt" key={e.id}>
                <input type="checkbox" checked={picked.has(e.id)} onChange={() => toggle(e.id)} />
                <span className="ind" /><span className="name">{e.label}</span><span className="add">+฿{e.price}</span>
              </label>
            ))}
          </fieldset>
        )}

        <div className="note group">
          <label htmlFor="rmk">หมายเหตุถึงร้าน</label>
          <textarea id="rmk" placeholder="เช่น ไม่ใส่ผักชี, ขอช้อนส้อมเพิ่ม"
            value={note} onChange={(e) => setNote(e.target.value)} />
        </div>

        <div className="qty">
          <button onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} aria-label="ลดจำนวน">−</button>
          <span className="n" aria-live="polite">{qty}</span>
          <button onClick={() => setQty((q) => Math.min(20, q + 1))} aria-label="เพิ่มจำนวน">+</button>
        </div>
      </div>

      <div className="addbar">
        {blocked ? (
          <button className="btn btn--ghost" disabled>
            <span>นอกพื้นที่จัดส่ง · ส่งในรัศมี {SERVICE_ZONE_KM} กม.</span>
          </button>
        ) : (
          <button className="btn btn--chili" onClick={addToCart}>
            <span>เพิ่มลงตะกร้า</span>
            <span className="total">฿{total}</span>
          </button>
        )}
      </div>
    </div>
  );
}
