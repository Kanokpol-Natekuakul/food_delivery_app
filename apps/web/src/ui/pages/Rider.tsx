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

/* ── Inline SVG icons (no emoji dependency) ── */

function IconMotorbike({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18.5" cy="17.5" r="3.5" />
      <circle cx="5.5" cy="17.5" r="3.5" />
      <path d="M15 6h1.5l2 4.5" />
      <path d="M2 17.5h3.5" />
      <path d="M9 17.5h5.5l-3-7H7l-2 4" />
    </svg>
  );
}

function IconStore({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21h18" />
      <path d="M3 7v1a3 3 0 0 0 6 0V7" />
      <path d="M9 7v1a3 3 0 0 0 6 0V7" />
      <path d="M15 7v1a3 3 0 0 0 6 0V7" />
      <path d="M3 7l2-4h14l2 4" />
      <path d="M5 21V10.9" />
      <path d="M19 21V10.9" />
      <path d="M9 21v-6h6v6" />
    </svg>
  );
}

function IconPin({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function IconBan({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="m4.9 4.9 14.2 14.2" />
    </svg>
  );
}

function IconAlert({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function IconClock({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function IconArrowDown({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <polyline points="19 12 12 19 5 12" />
    </svg>
  );
}

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
    const id = setInterval(() => setWaited((w) => w + 1), 1000);
    return () => clearInterval(id);
  }, [held]);

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
          <span className="r-banner-icon"><IconBan /></span>
          <span>บัญชีคุณถูกพักงาน — รับงานใหม่ไม่ได้ (ติดต่อแอดมิน){downranked ? ' · ถูกลดอันดับการจ่ายงาน' : ''}</span>
        </div>
      )}
      {warned && (
        <div className="r-warn" role="status">
          <span className="r-banner-icon"><IconAlert /></span>
          <span>มีการแจ้งเตือนจากสถิติร้องเรียน — โปรดปรับปรุงคุณภาพการส่ง{downranked ? ' · บัญชีถูกลดอันดับการจ่ายงาน' : ''}</span>
        </div>
      )}
      {held && (
        <div className="r-hold" role="status">
          <span className="r-banner-icon"><IconClock /></span>
          <span>
            ถูกลดอันดับ — งานนี้เปิดให้ไรเดอร์อันดับสูงคว้าก่อน (เหลือ <span className="r-mono-num">{Math.max(0, RIDER_PRIORITY_WINDOW_SEC - waited)}</span> วิ)
          </span>
          <button className="btn btn--ghost" onClick={() => setWaited(RIDER_PRIORITY_WINDOW_SEC)}>ข้ามช่วงรอ (เดโม)</button>
        </div>
      )}
    </div>
  );
}
