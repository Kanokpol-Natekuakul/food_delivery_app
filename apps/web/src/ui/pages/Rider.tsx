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
import { IconMotorbike, IconStore, IconPin, IconBan, IconAlertTriangle, IconClock, IconArrowDown } from '../components/Icons';

const ACTION: Record<RiderAction, { label: string; cls: string; run: (s: OrderState) => TransitionResult }> = {
  claim: { label: 'คว้างาน', cls: 'btn--mango', run: claimJob },
  arriveAtMerchant: { label: 'ถึงร้าน', cls: 'btn--ghost', run: riderArriveAtMerchant },
  pickup: { label: 'รับอาหาร', cls: 'btn--mango', run: pickup },
  arriveAtCustomer: { label: 'ถึงหน้าบ้าน', cls: 'btn--ghost', run: riderArriveAtCustomer },
  confirmDelivery: { label: 'ยืนยัน OTP', cls: 'btn--mango', run: (s) => confirmDelivery(s, { otpMatches: true }) },
  declareFailed: { label: 'ส่งไม่ได้', cls: 'btn--ghost', run: (s) => declareFailedDelivery(s, { attemptsExhausted: true }) },
  release: { label: 'คืนงาน', cls: 'btn--ghost', run: releaseClaim },
};


/* ── Audio feedback ── */

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

/* ── Confirm Button (destructive actions) ── */

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
    <span className="r-confirm">
      <button className="btn btn--chili r-confirm__yes" onClick={() => { setArmed(false); onConfirm(); }}>{confirmLabel}</button>
      <button className="btn btn--ghost r-confirm__no" onClick={() => setArmed(false)}>ย้อนกลับ</button>
    </span>
  );
}

/* ── Main Rider Console ── */

export function Rider() {
  const { state, dispatch } = useStore();
  const order = state.order;
  const placed = state.placed;

  // ตัวตนไรเดอร์จาก session ถ้าล็อกอินเป็น rider ไม่งั้น fallback เดโม (rider:somchai)
  const riderId = riderActorId(state);
  const riderName = riderId.replace(/^rider:/, '');
  const suspended = isSuspended(state.suspended, riderId);
  const downranked = state.downranked.includes(riderId);
  // แจ้งเตือนจากสถิติ (แสดงเมื่อยังไม่ถูกระงับ — ระงับมีแบนเนอร์ของตัวเอง)
  const warned = state.notified.includes(riderId) && !suspended;

  // pull-based dispatch (ADR 0001): ไรเดอร์ถูกลดอันดับต้องรอช่วงให้สิทธิ์อันดับสูงก่อน
  const jobOpen = order ? (order.kind === 'AwaitingHandoff' && order.rider === 'Unclaimed') : false;
  const [waited, setWaited] = useState(0);
  const held = isPriorityHeld(downranked, waited) && jobOpen && !suspended;

  useEffect(() => {
    if (!held) return;
    const speed = state.simSpeed ?? 1;
    const id = setInterval(() => setWaited((w) => w + 1), Math.max(50, 1000 / speed));
    return () => clearInterval(id);
  }, [held, state.simSpeed]);

  // เสียงแจ้งเตือนเมื่อมีงานใหม่เข้าสำหรับไรเดอร์
  useEffect(() => {
    if (jobOpen && !suspended && !held) {
      playChime();
    }
  }, [jobOpen]);

  const view = order ? riderView(order) : { active: false, stageLabel: '', actions: [] as RiderAction[] };
  const restaurant = findRestaurant(state.restaurants, placed?.restaurantId ?? undefined);

  const apply = (a: RiderAction) => {
    if (!order) return;
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
        <span className="r-who">
          <span className="r-who-icon"><IconMotorbike size={16} /></span>
          งานไรเดอร์ · {riderName}
        </span>
        <div className="r-links">
          <Link className="r-back" to="/">ไปฝั่งลูกค้า</Link>
          <Link className="r-forward" to="/merchant">ดูฝั่งร้าน</Link>
        </div>
      </div>

      {!order ? (
        <div className="empty">
          <div className="big"><IconMotorbike size={48} /></div>
          <p>ยังไม่มีงานวิ่ง — รอออเดอร์ใหม่</p>
        </div>
      ) : (
        <article className="r-ticket">
          <div className="r-ticket__head">
            <span className="r-no">#{state.liveOrderId || '1042'}</span>
            <span className={`r-stage${view.active ? '' : ' r-stage--done'}`}>{view.stageLabel}</span>
          </div>

          {restaurant && (
            <div className="r-route">
              <div className="r-route__point">
                <span className="r-route__label">
                  <span className="r-route__icon r-route__icon--pickup"><IconStore /></span>
                  จุดรับอาหาร
                </span>
                <span className="r-route__value">{restaurant.name}</span>
              </div>
              <span className="r-route__arrow" aria-hidden="true"><IconArrowDown /></span>
              <div className="r-route__point">
                <span className="r-route__label">
                  <span className="r-route__icon r-route__icon--drop"><IconPin /></span>
                  จุดส่งอาหาร
                </span>
                <span className="r-route__value">{state.deliveryLabel || 'ลาดพร้าว ซ.1'}</span>
              </div>
            </div>
          )}

          <ul className="r-lines">
            {placed?.lines.map((l) => (
              <li key={l.id}>
                <span className="r-qty">{l.qty}x</span>
                <span className="r-item">{l.itemName}</span>
              </li>
            ))}
          </ul>

          <div className="r-actions">
            {view.actions.length === 0 ? (
              <p className="r-idle">{view.active ? 'รอขั้นตอนถัดไป...' : 'งานนี้จบแล้ว'}</p>
            ) : (
              view.actions.map((a) => {
                if (a === 'release' || a === 'declareFailed') {
                  return (
                    <ConfirmButton key={a} className={`btn ${ACTION[a].cls}`}
                      label={ACTION[a].label} confirmLabel={`ยืนยัน${ACTION[a].label}`}
                      onConfirm={() => apply(a)} />
                  );
                }
                return (
                  <button key={a} className={`btn ${ACTION[a].cls}`}
                    disabled={a === 'claim' && (suspended || held)} onClick={() => apply(a)}>
                    {ACTION[a].label}
                  </button>
                );
              })
            )}
          </div>
        </article>
      )}

      {suspended && (
        <div className="r-susp" role="status">
          <span className="r-banner-icon"><IconBan aria-label="ไอคอนบัญชีถูกระงับสิทธิ์" /></span>
          <span>บัญชีคุณถูกพักงาน — รับงานใหม่ไม่ได้ (ติดต่อแอดมิน){downranked ? ' · ถูกลดอันดับการจ่ายงาน' : ''}</span>
        </div>
      )}
      {warned && (
        <div className="r-warn" role="status">
          <span className="r-banner-icon"><IconAlertTriangle aria-label="ไอคอนคำเตือนปรับปรุงการส่งงาน" /></span>
          <span>มีการแจ้งเตือนจากสถิติร้องเรียน — โปรดปรับปรุงคุณภาพการส่ง{downranked ? ' · บัญชีถูกลดอันดับการจ่ายงาน' : ''}</span>
        </div>
      )}
      {held && (
        <div className="r-hold" role="status">
          <span className="r-banner-icon"><IconClock aria-label="ไอคอนจับเวลาระงับการจัดสรรงานสิทธิ์แรก" /></span>
          <span>
            ถูกลดอันดับ — งานนี้เปิดให้ไรเดอร์อันดับสูงคว้าก่อน (เหลือ <span className="r-mono-num">{Math.max(0, RIDER_PRIORITY_WINDOW_SEC - waited)}</span> วิ)
          </span>
          <button className="btn btn--ghost" onClick={() => setWaited(RIDER_PRIORITY_WINDOW_SEC)}>ข้ามช่วงรอ (เดโม)</button>
        </div>
      )}
    </div>
  );
}
