import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store';
import { validateItemFields } from '@app/domain/menu/menu.js';
import { findRestaurant } from '../data/catalog';
import type { Dish } from '../data/catalog';
import './MerchantMenu.css';

// V1: ร้านนี้คือร้านของ Merchant ที่ล็อกอินอยู่ (ในแอปจริงมาจากบัญชีร้าน)
const MERCHANT_RESTAURANT_ID = 'khao-man-kai';

type Fields = { name: string; price: string; desc: string };
const emptyFields: Fields = { name: '', price: '', desc: '' };

export function MerchantMenu() {
  const { state } = useStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const restaurant = findRestaurant(state.restaurants, MERCHANT_RESTAURANT_ID);

  if (!restaurant) {
    return (
      <div className="mmenu">
        <Link className="m-back" to="/merchant">‹ คอนโซลร้าน</Link>
        <div className="empty"><div className="big">🏪</div><p>ไม่พบร้าน</p></div>
      </div>
    );
  }

  return (
    <div className="mmenu">
      <div className="mmenu-top">
        <Link className="m-back" to="/merchant">‹ คอนโซลร้าน</Link>
        <span className="mmenu-title">จัดการเมนู · {restaurant.name}</span>
      </div>

      <ul className="mmenu-list">
        {restaurant.dishes.map((d) =>
          editingId === d.id ? (
            <DishEditor key={d.id} restaurantId={restaurant.id} dish={d} onDone={() => setEditingId(null)} />
          ) : (
            <DishRow key={d.id} restaurantId={restaurant.id} dish={d} onEdit={() => setEditingId(d.id)} />
          ),
        )}
      </ul>

      <AddDish restaurantId={restaurant.id} />
    </div>
  );
}

function DishRow({ restaurantId, dish, onEdit }: { restaurantId: string; dish: Dish; onEdit: () => void }) {
  const { dispatch } = useStore();
  return (
    <li className="mdish">
      <div className="mdish-main">
        <div className="mdish-name">{dish.icon} {dish.name} <span className="mdish-price">฿{dish.basePrice}</span></div>
        {dish.desc && <div className="mdish-desc">{dish.desc}</div>}
      </div>
      <div className="mdish-act">
        <button className="btn btn--ghost" aria-label={`แก้ไข ${dish.name}`} onClick={onEdit}>แก้ไข</button>
        <button className="btn btn--ghost mdish-del" aria-label={`ลบ ${dish.name}`}
          onClick={() => dispatch({ type: 'menuRemoveDish', restaurantId, dishId: dish.id })}>ลบ</button>
      </div>
    </li>
  );
}

function DishEditor({ restaurantId, dish, onDone }: { restaurantId: string; dish: Dish; onDone: () => void }) {
  const { dispatch } = useStore();
  const [f, setF] = useState<Fields>({ name: dish.name, price: String(dish.basePrice), desc: dish.desc });
  const [err, setErr] = useState<string | null>(null);

  const save = () => {
    const basePrice = Number(f.price);
    const bad = validateItemFields({ name: f.name, basePrice });
    if (bad) { setErr(bad); return; }
    dispatch({ type: 'menuUpdateDish', restaurantId, dishId: dish.id, fields: { name: f.name.trim(), basePrice, desc: f.desc.trim() } });
    onDone();
  };

  return (
    <li className="mdish mdish--edit">
      <DishFields f={f} setF={setF} />
      {err && <p className="mdish-err" role="alert">{err}</p>}
      <div className="mdish-act">
        <button className="btn btn--mango" onClick={save}>บันทึก</button>
        <button className="btn btn--ghost" onClick={onDone}>ยกเลิก</button>
      </div>
    </li>
  );
}

function AddDish({ restaurantId }: { restaurantId: string }) {
  const { dispatch } = useStore();
  const [f, setF] = useState<Fields>(emptyFields);
  const [err, setErr] = useState<string | null>(null);

  const add = () => {
    const basePrice = Number(f.price);
    const bad = validateItemFields({ name: f.name, basePrice });
    if (bad) { setErr(bad); return; }
    const dish: Dish = { id: crypto.randomUUID(), name: f.name.trim(), basePrice, desc: f.desc.trim(), icon: '🍽️' };
    dispatch({ type: 'menuAddDish', restaurantId, dish });
    setF(emptyFields); setErr(null);
  };

  return (
    <section className="madd">
      <h2 className="madd-title">เพิ่มเมนูใหม่</h2>
      <DishFields f={f} setF={setF} />
      {err && <p className="mdish-err" role="alert">{err}</p>}
      <button className="btn btn--mango madd-btn" onClick={add}>เพิ่มเมนู</button>
    </section>
  );
}

function DishFields({ f, setF }: { f: Fields; setF: (f: Fields) => void }) {
  return (
    <div className="mfields">
      <input className="mfield" aria-label="ชื่อเมนู" placeholder="ชื่อเมนู"
        value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      <input className="mfield mfield--price" aria-label="ราคา" placeholder="ราคา" inputMode="numeric"
        value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} />
      <input className="mfield" aria-label="รายละเอียด" placeholder="รายละเอียด (ไม่บังคับ)"
        value={f.desc} onChange={(e) => setF({ ...f, desc: e.target.value })} />
    </div>
  );
}
