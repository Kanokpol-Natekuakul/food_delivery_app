import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store';
import type { OrderState } from '@app/domain/order/state.js';
import type { TransitionResult } from '@app/domain/order/transitions.js';
import {
  merchantAccept, merchantMarkReady, merchantReject,
  claimJob, riderArriveAtMerchant, pickup, riderArriveAtCustomer,
  confirmDelivery, declareFailedDelivery, cancelByCustomer, deliveryTimeout, releaseClaim,
} from '@app/domain/order/transitions.js';
import {
  FREE_CANCELLATION_WINDOW_SEC, DELIVERY_TIMEOUT_MIN, CLAIM_EXPIRY_MIN,
  FAILED_DELIVERY_WAIT_MIN, FAILED_DELIVERY_MIN_CALLS,
  isWithinFreeWindow, isDeliveryTimedOut, isClaimExpired, isAttemptsExhausted,
} from '@app/domain/order/timers.js';
import type { DisputeCategory } from '@app/domain/dispute/dispute.js';
import { OrderTracker } from '../order/OrderTracker';
import './Track.css';

const CATEGORY_OPTIONS: { value: DisputeCategory; label: string }[] = [
  { value: 'wrong_item', label: 'ได้ผิดรายการ' },
  { value: 'damaged', label: 'อาหารเสียหาย' },
  { value: 'foreign_object', label: 'มีสิ่งแปลกปลอม' },
];

type Action = { label: string; run: (s: OrderState) => TransitionResult };

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function Track() {
  const { state, dispatch } = useStore();
  const order = state.order;
  const [msg, setMsg] = useState<string>('');

  // ── นาฬิกาจำลอง: 1 วินาทีจริง = 1 "นาทีจำลอง" เพื่อให้เห็น Y/Z ทำงานในไม่กี่วินาที ──
  const [simMin, setSimMin] = useState(0);
  // นาฬิกาเดินเองได้ ยกเว้นผู้ใช้ขอลดการเคลื่อนไหว → เริ่มแบบหยุดไว้ ให้กดเดินเวลาเอง
  const [auto, setAuto] = useState(() => !prefersReducedMotion());
  // เวลา (จำลอง) ที่ไรเดอร์เริ่มคว้างาน — ใช้วัด Claim Expiry (รีเซ็ตเมื่อยังไม่คว้า)
  const [claimStartSim, setClaimStartSim] = useState<number | null>(null);

  // เดินเวลาอัตโนมัติ (เฉพาะตอนมีออเดอร์และเปิด auto)
  useEffect(() => {
    if (!auto || !order) return;
    const id = setInterval(() => setSimMin((m) => m + 1), 1000);
    return () => clearInterval(id);
  }, [auto, order]);

  // จับเวลาเริ่มคว้างาน: ตั้งครั้งแรกที่ rider พ้น Unclaimed, ล้างเมื่อกลับมา Unclaimed/จบ
  useEffect(() => {
    if (order?.kind === 'AwaitingHandoff' && order.rider !== 'Unclaimed') {
      setClaimStartSim((c) => (c === null ? simMin : c));
    } else {
      setClaimStartSim(null);
    }
  }, [order, simMin]);

  // ── auto-fire: ให้ predicate โดเมนเป็นคนตัดสิน แล้วยิง transition เองเมื่อครบเวลา ──
  useEffect(() => {
    if (!order || order.kind !== 'AwaitingHandoff') return;
    if (order.rider === 'Unclaimed') {
      // Y: ไม่มีไรเดอร์คว้าครบกำหนด → ระบบยกเลิก
      if (isDeliveryTimedOut(simMin)) {
        const r = deliveryTimeout(order);
        if (r.ok) {
          dispatch({ type: 'setOrder', order: r.state });
          setMsg(`⏱ ไม่มีไรเดอร์ครบ ${DELIVERY_TIMEOUT_MIN} นาที — ระบบยกเลิกอัตโนมัติ (คืนเต็ม)`);
        }
      }
    } else if (claimStartSim !== null && isClaimExpired(simMin - claimStartSim)) {
      // Z: คว้าแล้วไม่คืบหน้าครบกำหนด → ปลดงานคืนลิสต์
      const r = releaseClaim(order);
      if (r.ok) {
        dispatch({ type: 'setOrder', order: r.state });
        setMsg(`⏱ ไรเดอร์ไม่คืบหน้าครบ ${CLAIM_EXPIRY_MIN} นาที — ปลดงานคืนลิสต์อัตโนมัติ`);
      }
    }
  }, [order, simMin, claimStartSim, dispatch]);

  const freeWindowOpen = isWithinFreeWindow(simMin * 60);
  const claimElapsed = claimStartSim !== null ? simMin - claimStartSim : null;

  const actions: Action[] = [
    { label: 'ร้านรับออเดอร์', run: merchantAccept },
    { label: 'อาหารเสร็จ', run: merchantMarkReady },
    { label: 'ไรเดอร์คว้างาน', run: claimJob },
    { label: 'ไรเดอร์ถึงร้าน', run: riderArriveAtMerchant },
    { label: 'ไรเดอร์รับอาหาร', run: pickup },
    { label: 'ถึงหน้าบ้าน', run: riderArriveAtCustomer },
    { label: 'ยืนยัน OTP', run: (s) => confirmDelivery(s, { otpMatches: true }) },
    { label: `ส่งไม่ได้ (รอ ${FAILED_DELIVERY_WAIT_MIN} น.+โทร ${FAILED_DELIVERY_MIN_CALLS})`,
      run: (s) => declareFailedDelivery(s, {
        attemptsExhausted: isAttemptsExhausted(FAILED_DELIVERY_WAIT_MIN, FAILED_DELIVERY_MIN_CALLS),
      }) },
    { label: `ลูกค้ายกเลิก (ฟรี ≤${FREE_CANCELLATION_WINDOW_SEC} วิ)`,
      run: (s) => cancelByCustomer(s, { withinFreeWindow: freeWindowOpen }) },
    { label: 'ร้านปฏิเสธ', run: merchantReject },
  ];

  const resetAll = () => {
    dispatch({ type: 'reset' });
    setSimMin(0);
    setClaimStartSim(null);
    setMsg('');
  };

  if (!order) {
    return (
      <div className="app">
        <Link className="track-back" to="/">‹ กลับหน้าแรก</Link>
        <div className="empty">
          <div className="big">🧾</div>
          <p>ยังไม่มีออเดอร์ที่กำลังติดตาม</p>
          <Link className="btn btn--mango" to="/">เริ่มสั่งอาหาร</Link>
        </div>
      </div>
    );
  }

  const apply = (a: Action) => {
    const r = a.run(order);
    if (r.ok) { dispatch({ type: 'setOrder', order: r.state }); setMsg(''); }
    else setMsg(`✗ ${a.label}: ${r.reason}`);
  };

  return (
    <div className="app">
      <Link className="track-back" to="/">‹ กลับหน้าแรก</Link>
      <OrderTracker state={order} />

      <section className="panel">
        <div className="panel__label">แผงควบคุม (เดโม): กดเพื่อสั่ง state machine จริง</div>

        <div className="panel__clock">
          <span className="panel__sim">⏱ เวลาจำลอง <b>{simMin}</b> นาที</span>
          <button className="btn btn--ghost" onClick={() => setAuto((a) => !a)}>
            {auto ? '⏸ หยุดเวลา' : '▶ เดินเวลา'}
          </button>
          <button className="btn btn--ghost" onClick={() => setSimMin((m) => m + 1)}>+1 นาที</button>
        </div>
        <p className="panel__policy">
          ยกเลิกฟรี {freeWindowOpen ? 'ได้' : 'พ้นแล้ว'} (≤{FREE_CANCELLATION_WINDOW_SEC} วิ)
          · Y={DELIVERY_TIMEOUT_MIN} น. (ยกเลิกเอง) · Z={CLAIM_EXPIRY_MIN} น. (ปลดงานเอง
          {claimElapsed !== null ? ` · คว้ามาแล้ว ${claimElapsed} น.` : ''})
        </p>

        <div className="panel__row">
          {actions.map((a) => (
            <button key={a.label} className="btn btn--ghost" onClick={() => apply(a)}>{a.label}</button>
          ))}
          <button className="btn btn--mango" onClick={resetAll}>รีเซ็ต</button>
        </div>
        {msg && <p className="panel__msg">{msg}</p>}
      </section>

      {order.kind === 'Completed' && <ComplaintBox />}
    </div>
  );
}

/** แจ้งปัญหาหลังรับของ (ADR 0006) — โผล่เฉพาะออเดอร์ที่ส่งสำเร็จแล้ว */
function ComplaintBox() {
  const { dispatch } = useStore();
  const [category, setCategory] = useState<DisputeCategory>('wrong_item');
  const [hasPhoto, setHasPhoto] = useState(false);
  const [filed, setFiled] = useState(false);

  if (filed) {
    return (
      <section className="panel complaint">
        <p className="complaint__done">✅ รับเรื่องร้องเรียนแล้ว — ทีมงานจะตรวจสอบและติดต่อกลับ</p>
      </section>
    );
  }

  // ปุ่มถูกปิดจนกว่าจะแนบรูป + กล่องนี้โผล่เฉพาะออเดอร์ Completed → โดเมนรับเสมอ
  const submit = () => {
    dispatch({ type: 'fileDispute', category, hasPhoto });
    setFiled(true);
  };

  return (
    <section className="panel complaint">
      <div className="panel__label">แจ้งปัญหาหลังรับของ</div>
      <label className="complaint__field">
        ปัญหาที่พบ
        <select value={category} onChange={(e) => setCategory(e.target.value as DisputeCategory)}>
          {CATEGORY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      <label className="complaint__photo">
        <input type="checkbox" checked={hasPhoto} onChange={(e) => setHasPhoto(e.target.checked)} />
        แนบรูปหลักฐาน (จำเป็น)
      </label>
      <button className="btn btn--mango" disabled={!hasPhoto} onClick={submit}>ส่งเรื่องร้องเรียน</button>
      {!hasPhoto && <p className="complaint__hint">ต้องแนบรูปเป็นหลักฐานก่อนส่ง</p>}
    </section>
  );
}
