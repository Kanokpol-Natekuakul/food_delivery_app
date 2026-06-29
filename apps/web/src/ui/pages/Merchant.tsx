import { Link } from 'react-router-dom';
import { useStore } from '../store';
import type { OrderState } from '@app/domain/order/state.js';
import type { TransitionResult } from '@app/domain/order/transitions.js';
import { merchantAccept, merchantMarkReady, merchantReject } from '@app/domain/order/transitions.js';
import type { MerchantAction } from '@app/domain/order/merchantView.js';
import { merchantView } from '@app/domain/order/merchantView.js';
import { findRestaurant } from '../data/catalog';
import './Merchant.css';

const ACTION: Record<MerchantAction, { label: string; cls: string; run: (s: OrderState) => TransitionResult }> = {
  accept: { label: 'รับออเดอร์', cls: 'btn--mango', run: merchantAccept },
  markReady: { label: 'อาหารเสร็จ', cls: 'btn--mango', run: merchantMarkReady },
  reject: { label: 'ปฏิเสธ', cls: 'btn--ghost', run: merchantReject },
};

export function Merchant() {
  const { state, dispatch } = useStore();
  const order = state.order;
  const placed = state.placed;

  if (!order) {
    return (
      <div className="merchant">
        <Link className="m-back" to="/">‹ ไปฝั่งลูกค้า</Link>
        <div className="empty">
          <div className="big">🏪</div>
          <p>ยังไม่มีออเดอร์เข้า — รอลูกค้าสั่ง</p>
        </div>
      </div>
    );
  }

  const view = merchantView(order);
  const restaurant = findRestaurant(state.restaurants, placed?.restaurantId ?? undefined);

  const apply = (a: MerchantAction) => {
    const r = ACTION[a].run(order);
    if (r.ok) dispatch({ type: 'setOrder', order: r.state });
  };

  return (
    <div className="merchant">
      <div className="m-top">
        <span className="m-who">🏪 ครัวร้าน{restaurant ? ` · ${restaurant.name}` : ''}</span>
        <span className="m-links">
          <Link className="m-back" to="/merchant/rate">ค่าคอม ›</Link>
          <Link className="m-back" to="/merchant/menu">จัดการเมนู ›</Link>
        </span>
      </div>

      <article className="m-ticket">
        <div className="m-ticket__head">
          <span className="m-no">ออเดอร์ #1042</span>
          <span className={`m-stage${view.active ? '' : ' m-stage--done'}`}>{view.stageLabel}</span>
        </div>

        <ul className="m-lines">
          {placed?.lines.map((l) => (
            <li key={l.id}>
              <span className="m-qty">×{l.qty}</span>
              <span className="m-item">
                {l.itemName}
                {(l.spice || l.options.length > 0) && (
                  <span className="m-opts"> · {[l.spice, ...l.options.map((o) => o.label)].filter(Boolean).join(' · ')}</span>
                )}
                {l.note && <span className="m-note"> “{l.note}”</span>}
              </span>
            </li>
          ))}
        </ul>

        <div className="m-actions">
          {view.actions.length === 0 ? (
            <p className="m-idle">{view.active ? 'รอขั้นตอนถัดไป…' : 'ออเดอร์นี้จบหน้าที่ของร้านแล้ว'}</p>
          ) : (
            view.actions.map((a) => (
              <button key={a} className={`btn ${ACTION[a].cls}`} onClick={() => apply(a)}>
                {ACTION[a].label}
              </button>
            ))
          )}
        </div>
      </article>
    </div>
  );
}
