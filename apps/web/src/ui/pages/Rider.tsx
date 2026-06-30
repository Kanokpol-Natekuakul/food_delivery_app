import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore, riderActorId } from '../store';
import type { OrderState } from '@app/domain/order/state.js';
import type { TransitionResult } from '@app/domain/order/transitions.js';
import {
  claimJob, releaseClaim, riderArriveAtMerchant, pickup,
  riderArriveAtCustomer, confirmDelivery, declareFailedDelivery,
} from '@app/domain/order/transitions.js';
import type { RiderAction } from '@app/domain/order/riderView.js';
import { riderView } from '@app/domain/order/riderView.js';
import { isPriorityHeld, RIDER_PRIORITY_WINDOW_SEC } from '@app/domain/order/timers.js';
import { isSuspended } from '@app/domain/moderation/moderation.js';
import { findRestaurant } from '../data/catalog';
import './Rider.css';

const ACTION: Record<RiderAction, { label: string; cls: string; run: (s: OrderState) => TransitionResult }> = {
  claim: { label: 'คว้างาน', cls: 'btn--mango', run: claimJob },
  arriveAtMerchant: { label: 'ถึงร้าน', cls: 'btn--ghost', run: riderArriveAtMerchant },
  pickup: { label: 'รับอาหาร', cls: 'btn--mango', run: pickup },
  arriveAtCustomer: { label: 'ถึงหน้าบ้าน', cls: 'btn--ghost', run: riderArriveAtCustomer },
  confirmDelivery: { label: 'ยืนยัน OTP', cls: 'btn--mango', run: (s) => confirmDelivery(s, { otpMatches: true }) },
  declareFailed: { label: 'ส่งไม่ได้', cls: 'btn--ghost', run: (s) => declareFailedDelivery(s, { attemptsExhausted: true }) },
  release: { label: 'คืนงาน', cls: 'btn--ghost', run: releaseClaim },
};

export function Rider() {
  const { state, dispatch } = useStore();
  const order = state.order;
  const placed = state.placed;

  if (!order) {
    return (
      <div className="rider">
        <Link className="r-back" to="/">‹ ไปฝั่งลูกค้า</Link>
        <div className="empty">
          <div className="big">🛵</div>
          <p>ยังไม่มีงานวิ่ง — รอออเดอร์ใหม่</p>
        </div>
      </div>
    );
  }

  // ตัวตนไรเดอร์จาก session ถ้าล็อกอินเป็น rider ไม่งั้น fallback เดโม (rider:somchai)
  const riderId = riderActorId(state);
  const riderName = riderId.replace(/^rider:/, '');
  const view = riderView(order);
  const restaurant = findRestaurant(state.restaurants, placed?.restaurantId ?? undefined);
  const suspended = isSuspended(state.suspended, riderId);
  const downranked = state.downranked.includes(riderId);
  // แจ้งเตือนจากสถิติ (แสดงเมื่อยังไม่ถูกระงับ — ระงับมีแบนเนอร์ของตัวเอง)
  const warned = state.notified.includes(riderId) && !suspended;

  // pull-based dispatch (ADR 0001): ไรเดอร์ถูกลดอันดับต้องรอช่วงให้สิทธิ์อันดับสูงก่อน
  const jobOpen = order.kind === 'AwaitingHandoff' && order.rider === 'Unclaimed';
  const [waited, setWaited] = useState(0);
  const held = isPriorityHeld(downranked, waited) && jobOpen && !suspended;
  useEffect(() => {
    if (!held) return;
    const id = setInterval(() => setWaited((w) => w + 1), 1000);
    return () => clearInterval(id);
  }, [held]);

  const apply = (a: RiderAction) => {
    // คว้างาน → claimLive (โดเมน claimJob ตรวจพักงาน/ช่วงให้สิทธิ์ + persist riderId=session ฝั่ง server)
    if (a === 'claim') {
      dispatch({ type: 'claimLive', rider: riderId, riderSuspended: suspended, priorityHeld: held });
      return;
    }
    const r = ACTION[a].run(order);
    if (r.ok) dispatch({ type: 'setOrder', order: r.state, txn: a }); // txn → mirror /transition (ราง ไรเดอร์)
  };

  return (
    <div className="rider">
      <div className="r-top">
        <span className="r-who">🛵 งานไรเดอร์ · {riderName}</span>
        <Link className="r-back" to="/merchant">ดูฝั่งร้าน ›</Link>
      </div>

      {suspended && (
        <div className="r-susp" role="status">⛔ บัญชีคุณถูกพักงาน — รับงานใหม่ไม่ได้ (ติดต่อแอดมิน){downranked ? ' · ถูกลดอันดับการจ่ายงาน' : ''}</div>
      )}
      {warned && (
        <div className="r-warn" role="status">⚠️ มีการแจ้งเตือนจากสถิติร้องเรียน — โปรดปรับปรุงคุณภาพการส่ง{downranked ? ' · บัญชีถูกลดอันดับการจ่ายงาน' : ''}</div>
      )}
      {held && (
        <div className="r-hold" role="status">
          ⏳ ถูกลดอันดับ — งานนี้เปิดให้ไรเดอร์อันดับสูงคว้าก่อน (เหลือ {Math.max(0, RIDER_PRIORITY_WINDOW_SEC - waited)} วิ)
          <button className="btn btn--ghost" onClick={() => setWaited(RIDER_PRIORITY_WINDOW_SEC)}>ข้ามช่วงรอ (เดโม)</button>
        </div>
      )}

      <article className="r-ticket">
        <div className="r-ticket__head">
          <span className="r-no">งาน #1042</span>
          <span className={`r-stage${view.active ? '' : ' r-stage--done'}`}>{view.stageLabel}</span>
        </div>

        {restaurant && (
          <div className="r-route">
            <span>🏪 รับที่ <b>{restaurant.name}</b></span>
            <span>📍 ส่งที่ ลาดพร้าว ซ.1</span>
          </div>
        )}

        <ul className="r-lines">
          {placed?.lines.map((l) => (
            <li key={l.id}>
              <span className="r-qty">×{l.qty}</span>
              <span className="r-item">{l.itemName}</span>
            </li>
          ))}
        </ul>

        <div className="r-actions">
          {view.actions.length === 0 ? (
            <p className="r-idle">{view.active ? 'รอขั้นตอนถัดไป…' : 'งานนี้จบแล้ว'}</p>
          ) : (
            view.actions.map((a) => (
              <button key={a} className={`btn ${ACTION[a].cls}`}
                disabled={a === 'claim' && (suspended || held)} onClick={() => apply(a)}>
                {ACTION[a].label}
              </button>
            ))
          )}
        </div>
      </article>
    </div>
  );
}
