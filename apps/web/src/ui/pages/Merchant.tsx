import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store';
import type { OrderState } from '@app/domain/order/state.js';
import type { TransitionResult } from '@app/domain/order/transitions.js';
import { merchantAccept, merchantMarkReady, merchantReject } from '@app/domain/order/transitions.js';
import type { MerchantAction } from '@app/domain/order/merchantView.js';
import { merchantView } from '@app/domain/order/merchantView.js';
import { findRestaurant } from '../data/catalog';
import './Merchant.css';
import { IconStore, IconFlame } from '../components/Icons';

const ACTION: Record<MerchantAction, { label: string; cls: string; run: (s: OrderState) => TransitionResult }> = {
  accept: { label: 'รับออเดอร์', cls: 'btn--mango', run: merchantAccept },
  markReady: { label: 'อาหารเสร็จ', cls: 'btn--mango', run: merchantMarkReady },
  reject: { label: 'ปฏิเสธ', cls: 'btn--ghost', run: merchantReject },
};

function playChime() {
  if (typeof window === 'undefined') return;
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate([100, 50, 100]);
  }
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    
    const playNote = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      
      gain.gain.setValueAtTime(0.15, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start(start);
      osc.stop(start + duration);
    };
    
    const now = ctx.currentTime;
    playNote(523.25, now, 0.3); // C5
    playNote(783.99, now + 0.12, 0.4); // G5
  } catch (e) {
    console.error('Failed to play chime:', e);
  }
}

function ConfirmButton({ className, label, confirmLabel, onConfirm }: {
  className: string;
  label: string;
  confirmLabel: string;
  onConfirm: () => void;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  if (!armed) {
    return (
      <button className={className} onClick={() => setArmed(true)}>{label}</button>
    );
  }
  return (
    <span className="m-confirm" style={{ display: 'inline-flex', gap: '8px' }}>
      <button className="btn btn--chili m-confirm__yes" onClick={() => { setArmed(false); onConfirm(); }}>{confirmLabel}</button>
      <button className="btn btn--ghost m-confirm__no" onClick={() => setArmed(false)}>ย้อนกลับ</button>
    </span>
  );
}

export function Merchant() {
  const { state, dispatch } = useStore();
  const order = state.order;
  const placed = state.placed;

  const view = order ? merchantView(order) : { active: false, stageLabel: '', actions: [] as MerchantAction[] };

  useEffect(() => {
    if (order && view.actions.includes('accept')) {
      playChime();
    }
  }, [order?.kind]);

  const merchantId = state.auth?.actorId;
  const restId = merchantId?.startsWith('merchant:') ? merchantId.replace(/^merchant:/, '') : undefined;
  const restaurant = findRestaurant(state.restaurants, restId || placed?.restaurantId || undefined);

  // หาออเดอร์ทั้งหมดที่เป็นของร้านนี้และกำลังดำเนินการ (Active)
  const activeOrders = state.orders.filter(
    (o) =>
      o.placed.restaurantId === (restId || placed?.restaurantId || null) &&
      !['Completed', 'FailedDelivery', 'Cancelled'].includes(o.state.kind)
  );

  // รวมจำนวนรายการอาหารที่ต้องทำสะสมทั้งหมด (Kitchen Prep Queue)
  const kitchenQueue: Record<string, { name: string; qty: number }> = {};
  activeOrders.forEach((o) => {
    o.placed.lines.forEach((line) => {
      const key = line.itemName;
      if (!kitchenQueue[key]) {
        kitchenQueue[key] = { name: line.itemName, qty: 0 };
      }
      kitchenQueue[key].qty += line.qty;
    });
  });

  const apply = (a: MerchantAction) => {
    if (!order) return;
    const r = ACTION[a].run(order);
    if (r.ok) dispatch({ type: 'setOrder', order: r.state, txn: a }); // txn → mirror /transition (ราง ร้าน)
  };

  return (
    <div className="merchant">
      <div className="m-top">
        <span className="m-who" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <IconStore size={18} /> ครัวร้าน{restaurant ? ` · ${restaurant.name}` : ''}
        </span>
        <span className="m-links">
          <Link className="m-back" to="/">‹ ไปฝั่งลูกค้า</Link>
          <Link className="m-forward" to="/merchant/rate">ค่าคอม ›</Link>
          <Link className="m-forward" to="/merchant/menu">จัดการเมนู ›</Link>
        </span>
      </div>

      {!order ? (
        <div className="empty">
          <div className="big" style={{ display: 'inline-flex', justifyContent: 'center' }}><IconStore size={48} /></div>
          <p>ยังไม่มีออเดอร์เข้า — รอลูกค้าสั่ง</p>
        </div>
      ) : (
        <article className="m-ticket">
          <div className="m-ticket__head">
            <span className="m-no">ออเดอร์ #{state.liveOrderId || '1042'}</span>
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
              view.actions.map((a) => {
                if (a === 'reject') {
                  return (
                    <ConfirmButton key={a} className={`btn ${ACTION[a].cls}`}
                      label={ACTION[a].label} confirmLabel={`ยืนยัน${ACTION[a].label}`}
                      onConfirm={() => apply(a)} />
                  );
                }
                return (
                  <button key={a} className={`btn ${ACTION[a].cls}`} onClick={() => apply(a)}>
                    {ACTION[a].label}
                  </button>
                );
              })
            )}
          </div>
        </article>
      )}

      {activeOrders.length > 0 && (
        <section className="m-prep">
          <h2 className="m-prep__title" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            <IconFlame size={20} /> สรุปรายการครัวที่ต้องเตรียมสะสม ({activeOrders.length} ออเดอร์)
          </h2>
          <div className="m-prep__grid">
            {Object.values(kitchenQueue).map((item) => (
              <div className="m-prep__item" key={item.name}>
                <span className="m-prep__qty">×{item.qty}</span>
                <span className="m-prep__name">{item.name}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
