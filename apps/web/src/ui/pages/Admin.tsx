import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore, MONITORED_PARTIES, orderVolume, clearPersistedState } from '../store';
import type { AdminOrder } from '../store';
import { foodTotal, SERVICE_FEE } from '@app/domain/cart/cart.js';
import { haversineKm, deliveryFee } from '@app/domain/delivery/delivery.js';
import { merchantView } from '@app/domain/order/merchantView.js';
import { riderView } from '@app/domain/order/riderView.js';
import { settle } from '@app/domain/settlement/settlement.js';
import type { Fault } from '@app/domain/settlement/settlement.js';
import { isSuspended } from '@app/domain/moderation/moderation.js';
import { isTerminal } from '@app/domain/order/state.js';
import { balance, accounts, isPayable, payableAccounts, isSettlementDueAt, nextSettlementAt, MIN_PAYOUT, PLATFORM, RIDER_POOL, REFUNDS } from '@app/domain/wallet/wallet.js';
import type { SettlementCadence } from '@app/domain/wallet/wallet.js';
import { complaintsAgainst, complaintsBy, flagParty, flagCustomer } from '@app/domain/dispute/dispute.js';
import type { Dispute, DisputeCategory, DisputeStatus, FlagLevel } from '@app/domain/dispute/dispute.js';
import type { RateRequest } from '@app/domain/revenue/revenue.js';
import { findRestaurant, ratesFor, merchantOverrides, CUSTOMER_LOCATION } from '../data/catalog';
import type { Restaurant } from '../data/catalog';
import './Admin.css';
import { IconWrench, IconMotorbike, IconStore, IconAlertTriangle, IconArrowDown, IconClock } from '../components/Icons';

function accountLabel(account: string, restaurants: readonly Restaurant[]): string {
  if (account === PLATFORM) return 'แพลตฟอร์ม';
  if (account === RIDER_POOL) return 'ไรเดอร์ (รวม)';
  if (account === REFUNDS) return 'คืนลูกค้า (รวม)';
  if (account.startsWith('merchant:')) {
    const r = findRestaurant(restaurants, account.slice('merchant:'.length));
    return r ? `ร้าน · ${r.name}` : account;
  }
  return account;
}

const FAULT_LABEL: Record<Fault, string> = { none: 'ไม่มีฝ่ายผิด', customer: 'ลูกค้าผิด', merchant: 'ร้านผิด' };
const signed = (n: number): string => (n >= 0 ? `+฿${n}` : `−฿${Math.abs(n)}`);

const CATEGORY_LABEL: Record<DisputeCategory, string> = {
  wrong_item: 'ได้ผิดรายการ', damaged: 'อาหารเสียหาย', foreign_object: 'มีสิ่งแปลกปลอม',
};
const DISPUTE_STATUS: Record<DisputeStatus, string> = {
  open: 'รอจัดการ', refunded: 'คืน goodwill แล้ว', rejected: 'ปฏิเสธ',
};
const riderName = (account: string): string => {
  const a = ACTORS.find((x) => x.id === account);
  return a ? a.name : account;
};

const FLAG_LABEL: Record<FlagLevel, string> = { ok: 'ปกติ', watch: 'จับตา', action: 'ดำเนินการ' };
const FlagBadge = ({ level }: { level: FlagLevel }) =>
  <span className={`a-flag a-flag--${level}`}>{FLAG_LABEL[level]}</span>;

// ผู้ใช้ที่แอดมินกำกับดูแล (แหล่งเดียวกับ auto-suspend ใน store) — ปริมาณออเดอร์คิดจากข้อมูลจริง
const ACTORS = MONITORED_PARTIES;

/**
 * ปุ่ม action ที่ย้อนไม่ได้ (force-cancel/ล้างข้อมูล) — ยืนยันแบบ inline สองจังหวะ:
 * กดครั้งแรก → ปุ่มสลับเป็น "ยืนยัน / ย้อนกลับ"; ยืนยันจึงทำจริง (auto-ยกเลิกใน 4 วิถ้าไม่ทำต่อ).
 * ใช้ inline แทน modal ตาม product register ("modal คือความขี้เกียจ — ใช้ inline ก่อน")
 */
function ConfirmButton({ className, label, triggerAria, confirmLabel, confirmAria, onConfirm }: {
  className: string;
  label: string;
  triggerAria: string;
  confirmLabel: string;
  confirmAria: string;
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
      <button className={className} aria-label={triggerAria} onClick={() => setArmed(true)}>{label}</button>
    );
  }
  return (
    <span className="a-confirm" role="group" aria-label={confirmAria}>
      <button className="btn btn--chili a-confirm__yes" aria-label={confirmAria}
        onClick={() => { setArmed(false); onConfirm(); }}>{confirmLabel}</button>
      <button className="btn btn--ghost a-confirm__no" onClick={() => setArmed(false)}>ย้อนกลับ</button>
    </span>
  );
}

export function Admin() {
  const { state, dispatch } = useStore();

  // ── ชั้น triage: นับงานที่ "รอแอดมินตัดสิน" จริง (ข้อมูลจริงจาก state) ──
  const openDisputes = state.disputes.filter((d) => d.status === 'open').length;
  const pendingRates = state.rateRequests.filter((q) => q.status === 'pending').length;
  const payableCount = payableAccounts(state.ledger).length;
  const triageTotal = openDisputes + pendingRates + payableCount;
  // จัดรายการที่ต้องลงมือ (open/pending) ขึ้นบนสุดของลิสต์ (stable sort)
  const sortedDisputes = [...state.disputes].sort(
    (a, b) => Number(b.status === 'open') - Number(a.status === 'open'),
  );
  const sortedRates = [...state.rateRequests].sort(
    (a, b) => Number(b.status === 'pending') - Number(a.status === 'pending'),
  );

  const [filter, setFilter] = useState<'all' | 'active' | 'completed' | 'cancelled'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest'>('newest');

  const parseOrderId = (id: string) => {
    const num = id.replace('order-', '');
    return parseInt(num, 10) || 0;
  };

  const activeOrdersCount = state.orders.filter((o) => !isTerminal(o.state)).length;

  const filteredOrders = state.orders.filter((o) => {
    if (filter === 'active') return !isTerminal(o.state);
    if (filter === 'completed') return o.state.kind === 'Completed';
    if (filter === 'cancelled') return isTerminal(o.state) && o.state.kind !== 'Completed';
    return true;
  });

  const sortedOrders = [...filteredOrders].sort((a, b) => {
    if (sortBy === 'newest') return parseOrderId(b.id) - parseOrderId(a.id);
    return parseOrderId(a.id) - parseOrderId(b.id);
  });

  return (
    <div className="admin">
      <div className="a-top">
        <span className="a-who" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><IconWrench size={18} /> ผู้ดูแลระบบ</span>
        <Link className="a-back" to="/">ไปฝั่งลูกค้า ›</Link>
      </div>

      <nav className="a-triage" aria-label="งานที่รอจัดการ">
        {triageTotal === 0 ? (
          <span className="a-triage__clear">✓ ไม่มีงานค้าง</span>
        ) : (
          <>
            <span className="a-triage__label">รอจัดการ</span>
            {openDisputes > 0 && (
              <a className="a-triage__item" href="#a-disputes"><b>{openDisputes}</b> ร้องเรียน</a>
            )}
            {pendingRates > 0 && (
              <a className="a-triage__item" href="#a-rates"><b>{pendingRates}</b> คำขออัตรา</a>
            )}
            {payableCount > 0 && (
              <a className="a-triage__item" href="#a-wallet"><b>{payableCount}</b> บัญชีถึงเกณฑ์</a>
            )}
          </>
        )}
      </nav>

      <section className="a-mod">
        <h2 className="a-h2">กำกับดูแลผู้ใช้</h2>
        <p className="a-wnote">ระบบยกระดับให้เองตามสถิติร้องเรียน — "จับตา": <strong>แจ้งเตือน</strong> · "ดำเนินการ": <strong>ลดอันดับ + พักงาน</strong> (รีวิวแล้วปลดเองได้)</p>
        {ACTORS.map((act) => {
          const suspended = isSuspended(state.suspended, act.id);
          const complaints = complaintsAgainst(state.disputes, act.id);
          const volume = orderVolume(state.orders, act.id);
          const level = flagParty(state.disputes, act.id, volume);
          return (
            <div className={`a-actor${suspended ? ' a-actor--off' : ''}`} key={act.id}>
              <div className="a-actor__main">
                <span className="a-actor__name" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  {act.icon === '🛵' ? <IconMotorbike size={16} /> : <IconStore size={16} />} {act.name}
                </span>
                <button className="btn btn--ghost a-actor__btn"
                  aria-label={`${suspended ? 'ปลดระงับ' : 'ระงับ'} ${act.name}`}
                  onClick={() => dispatch({ type: 'toggleSuspend', actor: act.id })}>
                  {suspended ? 'ปลดระงับ' : 'ระงับ'}
                </button>
              </div>
              <div className="a-actor__status">
                <span className="a-actor__stat">ร้องเรียน {complaints}/{volume}</span>
                <FlagBadge level={level} />
                {state.notified.includes(act.id) && (
                  <span className="a-act a-act--notify" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <IconAlertTriangle size={14} /> แจ้งเตือน
                  </span>
                )}
                {state.downranked.includes(act.id) && (
                  <span className="a-act a-act--downrank" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <IconArrowDown size={14} /> ลดอันดับ
                  </span>
                )}
                {suspended && <span className="a-susp">พักงาน</span>}
              </div>
            </div>
          );
        })}
      </section>

      <section className="a-wallet" id="a-wallet">
        <h2 className="a-h2">Wallet &amp; Settlement</h2>
        <p className="a-wnote">เงินเข้า wallet เมื่อออเดอร์จบ แล้วจ่ายออกเป็นรอบ — เฉพาะบัญชีที่ยอดถึงขั้นต่ำ ฿{MIN_PAYOUT}</p>
        <SettlementScheduler onRun={() => dispatch({ type: 'walletRunSettlement' })} />
        {payableAccounts(state.ledger).length > 0 && (
          <button className="btn btn--mango a-wrun" aria-label="รันรอบ settlement"
            onClick={() => dispatch({ type: 'walletRunSettlement' })}>
            รันรอบ settlement (กดถอนเอง) — จ่าย {payableAccounts(state.ledger).length} บัญชีที่ถึงเกณฑ์
          </button>
        )}
        {accounts(state.ledger).length === 0 && <p className="a-wempty">ยังไม่มีรายการ — เงินจะเข้า wallet เมื่อออเดอร์แรกจบวงจร</p>}
        {accounts(state.ledger).map((acc) => {
          const bal = balance(state.ledger, acc);
          const label = accountLabel(acc, state.restaurants);
          const payable = isPayable(state.ledger, acc);
          const accruing = acc !== REFUNDS && bal > 0 && !payable;
          return (
            <div className="a-wrow" key={acc}>
              <span className="a-wname">{label}</span>
              <span className="a-wbal">{bal < 0 ? `−฿${Math.abs(bal)}` : `฿${bal}`}</span>
              {payable && (
                <button className="btn btn--mango a-wpay" aria-label={`จ่ายออก ${label}`}
                  onClick={() => dispatch({ type: 'walletPayout', account: acc })}>จ่ายออก</button>
              )}
              {accruing && <span className="a-waccrue">ต่ำกว่าขั้นต่ำ · สะสมรอบหน้า</span>}
            </div>
          );
        })}
      </section>

      <section className="a-disputes" id="a-disputes">
        <h2 className="a-h2">ร้องเรียนหลังส่ง ({state.disputes.length})</h2>
        <p className="a-wnote">ลูกค้าร้องเรียนหลังรับของ พิสูจน์รายครั้งไม่ได้ → เลือกคืน goodwill (แพลตฟอร์มออกเอง) หรือปฏิเสธ; สถิติรายฝ่ายสะสมไว้จัดการระยะยาว</p>
        {state.disputes.length === 0 && <p className="a-wempty">ยังไม่มีคำร้อง — ลูกค้ายื่นได้ภายใน 2 ชม. หลังรับของ</p>}
        {sortedDisputes.map((d) => (
          <DisputeRow key={d.id} d={d} restaurants={state.restaurants} disputes={state.disputes}
            goodwill={goodwillAmount(state.orders, d)} customerOrders={orderVolume(state.orders, d.customer)}
            onResolve={(amount) => dispatch({ type: 'resolveDispute', id: d.id, amount })}
            onReject={() => dispatch({ type: 'rejectDispute', id: d.id })} />
        ))}
      </section>

      <section className="a-rates" id="a-rates">
        <h2 className="a-h2">คำขอปรับอัตราคอมมิชชัน ({state.rateRequests.length})</h2>
        <p className="a-wnote">ร้านขอลดค่าคอม — <strong>อนุมัติ / เสนอแย้ง</strong> (ร้านตอบรับเอง) / ปฏิเสธ; ที่ตกลงแล้วมีผลรอบถัดไป</p>
        {state.rateRequests.length === 0 && <p className="a-wempty">ยังไม่มีคำขอ — ร้านยื่นขอลดคอมได้จากคอนโซลร้าน</p>}
        {sortedRates.map((q) => (
          <RateRequestRow key={q.id} q={q} name={accountLabel(`merchant:${q.merchantId}`, state.restaurants)}
            onApprove={() => dispatch({ type: 'approveRateRequest', id: q.id })}
            onReject={() => dispatch({ type: 'rejectRateRequest', id: q.id })}
            onCounter={(counter) => dispatch({ type: 'counterRateRequest', id: q.id, counter })} />
        ))}
      </section>

      <section className="a-orders">
        <h2 className="a-h2">ออเดอร์ในระบบ ({filteredOrders.length})</h2>

        <div className="a-ocontrols">
          <div className="a-ofilters">
            <button className={`chip ${filter === 'all' ? 'chip--mango' : ''}`} onClick={() => setFilter('all')}>ทั้งหมด</button>
            <button className={`chip ${filter === 'active' ? 'chip--mango' : ''}`} onClick={() => setFilter('active')}>กำลังดำเนินการ</button>
            <button className={`chip ${filter === 'completed' ? 'chip--mango' : ''}`} onClick={() => setFilter('completed')}>สำเร็จแล้ว</button>
            <button className={`chip ${filter === 'cancelled' ? 'chip--mango' : ''}`} onClick={() => setFilter('cancelled')}>ยกเลิก/ล้มเหลว</button>
          </div>
          <div className="a-osorts">
            <select aria-label="เรียงลำดับออเดอร์" value={sortBy} onChange={(e) => setSortBy(e.target.value as 'newest' | 'oldest')} className="a-select">
              <option value="newest">ออเดอร์ล่าสุด</option>
              <option value="oldest">ออเดอร์เก่าสุด</option>
            </select>
          </div>
          {activeOrdersCount > 0 && (
            <div className="a-obulk">
              <ConfirmButton className="btn btn--ghost a-cancel-all"
                triggerAria="ยกเลิกออเดอร์ที่กำลังดำเนินการทั้งหมด" label={`ยกเลิกทั้งหมด (${activeOrdersCount})`}
                confirmAria="ยืนยันยกเลิกทั้งหมด" confirmLabel="ยืนยันยกเลิกทั้งหมด"
                onConfirm={() => dispatch({ type: 'adminCancelAllActive' })} />
            </div>
          )}
        </div>

        {sortedOrders.length === 0 && <p className="a-wempty">ยังไม่มีออเดอร์ — จะปรากฏเมื่อลูกค้าสั่งและออเดอร์เริ่มเดินวงจร</p>}
        {sortedOrders.map((o) => (
          <OrderRow key={o.id} o={o} restaurants={state.restaurants} rateOverrides={state.rateOverrides}
            onCancel={() => dispatch({ type: 'adminCancelOrder', id: o.id })} />
        ))}
      </section>

      <footer className="a-footer">
        <ConfirmButton className="btn btn--ghost a-reset"
          triggerAria="ล้างข้อมูลที่บันทึก (รีเซ็ตเป็นค่าตั้งต้น)" label="ล้างข้อมูลที่บันทึก (รีเซ็ตเป็นค่าตั้งต้น)"
          confirmAria="ยืนยันล้างข้อมูล" confirmLabel="ยืนยันล้างข้อมูล"
          onConfirm={() => { clearPersistedState(); dispatch({ type: 'resetApp' }); }} />
      </footer>
    </div>
  );
}

/**
 * ตัวจับเวลารอบ settlement อัตโนมัติ (ADR 0004) — ผูกเวลาจริง (wall clock) + จำรอบล่าสุดข้ามรีโหลด
 * เมื่อเวลาจริงถึง/เลยกำหนดรอบถัดไป (รายวัน/สัปดาห์) ระบบรันรอบจ่ายเงินเองโดยไม่ต้องกด
 */
const LS_LAST_RUN = 'settlement.lastRunAt';
const LS_CADENCE = 'settlement.cadence';

function SettlementScheduler({ onRun }: { onRun: () => void }) {
  const [cadence, setCadence] = useState<SettlementCadence>(
    () => (localStorage.getItem(LS_CADENCE) as SettlementCadence) || 'daily',
  );
  // รอบล่าสุด: อ่านจาก localStorage; ครั้งแรกสุด = ตั้งเป็น "ตอนนี้" (เริ่มนับ ไม่รันทันที)
  const [lastRunAt, setLastRunAt] = useState<number>(() => {
    const stored = localStorage.getItem(LS_LAST_RUN);
    if (stored) return Number(stored);
    const now = Date.now();
    localStorage.setItem(LS_LAST_RUN, String(now));
    return now;
  });
  const [now, setNow] = useState(() => Date.now());
  const [msg, setMsg] = useState('');

  // เดินนาฬิกาจริง — เช็คเป็นระยะ (พอให้รอบยิงเองเมื่อถึงกำหนด/หลังเปิดทิ้งไว้)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => { localStorage.setItem(LS_CADENCE, cadence); }, [cadence]);

  // ถึงรอบตามเวลาจริง → รันรอบ settlement เอง แล้วเลื่อนรอบล่าสุดมาปัจจุบัน (persist)
  useEffect(() => {
    if (isSettlementDueAt(now, lastRunAt, cadence)) {
      onRun();
      const t = Date.now();
      setLastRunAt(t);
      localStorage.setItem(LS_LAST_RUN, String(t));
      setMsg(`[ระบบ] รอบ settlement อัตโนมัติ — ${new Date(t).toLocaleString('th-TH')}`);
    }
  }, [now, lastRunAt, cadence, onRun]);

  const cadenceLabel = cadence === 'daily' ? 'รายวัน' : 'รายสัปดาห์';
  const nextAt = new Date(nextSettlementAt(lastRunAt, cadence)).toLocaleString('th-TH');
  return (
    <div className="a-sched">
      <span className="a-schedinfo" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
        <IconClock size={14} /> รอบถัดไป (เวลาจริง): <b>{nextAt}</b> · {cadenceLabel}
      </span>
      <div className="a-schedbtns">
        <button className="btn btn--ghost" onClick={() => setCadence((c) => (c === 'daily' ? 'weekly' : 'daily'))}>
          สลับเป็น{cadence === 'daily' ? 'รายสัปดาห์' : 'รายวัน'}
        </button>
      </div>
      {msg && <p className="a-schedmsg">{msg}</p>}
    </div>
  );
}

function RateRequestRow({ q, name, onApprove, onReject, onCounter }: {
  q: RateRequest;
  name: string;
  onApprove: () => void;
  onReject: () => void;
  onCounter: (counter: number) => void;
}) {
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const proposedPct = Math.round(q.proposedRate * 100);
  const currentPct = Math.round(q.currentRate * 100);
  const [counter, setCounter] = useState(Math.round((proposedPct + currentPct) / 2));
  const counterValid = counter > proposedPct && counter < currentPct;

  return (
    <div className="a-rrow" key={q.id}>
      <div className="a-rinfo">
        <span className="a-rname">{name}</span>
        <span className="a-rmove">
          คอม {pct(q.currentRate)} → <b>{pct(q.proposedRate)}</b>
          {q.counterRate !== undefined ? ` · เสนอแย้ง ${pct(q.counterRate)}` : ''}
          {q.reason ? ` · “${q.reason}”` : ''}
        </span>
      </div>
      {q.status === 'pending' ? (
        <div className="a-ractions">
          <button className="btn btn--mango a-rapprove" aria-label={`อนุมัติคำขอ ${name}`} onClick={onApprove}>อนุมัติ</button>
          <span className="a-rcounter">
            <input type="number" aria-label={`อัตราเสนอแย้ง ${name}`} min={proposedPct + 1} max={currentPct - 1}
              value={counter} onChange={(e) => setCounter(Number(e.target.value))} />%
            <button className="btn btn--ghost" aria-label={`เสนอแย้ง ${name}`} disabled={!counterValid}
              onClick={() => onCounter(counter / 100)}>เสนอแย้ง</button>
          </span>
          <button className="btn btn--ghost a-rreject" aria-label={`ปฏิเสธคำขอ ${name}`} onClick={onReject}>ปฏิเสธ</button>
        </div>
      ) : q.status === 'countered' ? (
        <span className="a-flag a-flag--watch">เสนอแย้ง {pct(q.counterRate ?? 0)} · รอร้านตอบ</span>
      ) : (
        <span className={`a-flag a-flag--${q.status === 'approved' ? 'ok' : 'action'}`}>
          {q.status === 'approved' ? 'ตกลงแล้ว' : 'ปฏิเสธแล้ว'}
        </span>
      )}
    </div>
  );
}

/** ยอด goodwill ที่เสนอ = ค่าอาหารของออเดอร์ที่ถูกร้อง (ถ้าหาเจอ) มิฉะนั้นค่าตั้งต้น */
function goodwillAmount(orders: readonly AdminOrder[], d: Dispute): number {
  const o = orders.find((x) => x.id === d.orderId);
  return o ? foodTotal({ lines: o.placed.lines }) : 50;
}

function DisputeRow({ d, restaurants, disputes, goodwill, customerOrders, onResolve, onReject }: {
  d: Dispute;
  restaurants: readonly Restaurant[];
  disputes: readonly Dispute[];
  goodwill: number;
  customerOrders: number;
  onResolve: (amount: number) => void;
  onReject: () => void;
}) {
  const merchantLabel = accountLabel(d.merchant, restaurants);
  return (
    <article className="a-dispute">
      <div className="a-order__head">
        <span className="a-no">#{d.orderId}</span>
        <span className="a-kind">{DISPUTE_STATUS[d.status]}</span>
      </div>
      <div className="a-rails">
        <span>ปัญหา: {CATEGORY_LABEL[d.category]} {d.hasPhoto ? '· (มีรูปหลักฐาน)' : ''}</span>
        <span>พาดพิง: {merchantLabel} / {riderName(d.rider)}</span>
        <span className="a-dstat">
          ร้านนี้ถูกร้อง {complaintsAgainst(disputes, d.merchant)} ครั้ง ·
          ลูกค้ายื่นแล้ว {complaintsBy(disputes, d.customer)}/{customerOrders} ครั้ง
        </span>
        <span className="a-dstat">ลูกค้า: <FlagBadge level={flagCustomer(disputes, d.customer, customerOrders)} /></span>
      </div>

      {d.status === 'open' ? (
        <div className="a-dactions">
          <button className="btn btn--mango a-dgood" aria-label={`คืน goodwill #${d.orderId}`}
            onClick={() => onResolve(goodwill)}>คืน goodwill ฿{goodwill}</button>
          <button className="btn btn--ghost a-dreject" aria-label={`ปฏิเสธคำร้อง #${d.orderId}`}
            onClick={onReject}>ปฏิเสธ</button>
        </div>
      ) : (
        <div className="a-settle">
          <span className="a-money">
            {d.status === 'refunded' ? `คืน goodwill ฿${d.refund} (แพลตฟอร์มแบก)` : 'ปฏิเสธคำร้อง (ไม่คืนเงิน)'}
          </span>
        </div>
      )}
    </article>
  );
}

function OrderRow({ o, restaurants, rateOverrides, onCancel }: {
  o: AdminOrder;
  restaurants: readonly Restaurant[];
  rateOverrides: Record<string, number>;
  onCancel: () => void;
}) {
  const restaurant = findRestaurant(restaurants, o.placed.restaurantId ?? undefined);
  const food = foodTotal({ lines: o.placed.lines });
  const delivery = restaurant ? deliveryFee(haversineKm(CUSTOMER_LOCATION, restaurant.coord)) : 0;
  const rates = ratesFor(restaurant, merchantOverrides(rateOverrides));
  const s = settle(o.state, { food, delivery, service: SERVICE_FEE }, rates);
  const pct = (n: number) => `${Math.round(n * 100)}%`;

  return (
    <article className="a-order">
      <div className="a-order__head">
        <span className="a-no">#{o.id}{restaurant ? ` · ${restaurant.name}` : ''}</span>
        <span className="a-kind">{o.state.kind}</span>
      </div>
      <div className="a-rails">
        <span>ร้าน: {merchantView(o.state).stageLabel}</span>
        <span>ไรเดอร์: {riderView(o.state).stageLabel}</span>
      </div>

      {s === null ? (
        <ConfirmButton className="btn btn--ghost a-cancel"
          triggerAria={`ยกเลิกออเดอร์ #${o.id}`} label="ยกเลิกออเดอร์ (แอดมิน)"
          confirmAria={`ยืนยันยกเลิกออเดอร์ #${o.id}`} confirmLabel="ยืนยันยกเลิก"
          onConfirm={onCancel} />
      ) : (
        <div className="a-settle">
          <span className={`a-fault a-fault--${s.fault}`}>{FAULT_LABEL[s.fault]}</span>
          <span className="a-money">คืนลูกค้า ฿{s.customerRefund} · แพลตฟอร์มสุทธิ {signed(s.platformNet)}</span>
          {s.split && (
            <span className="a-split">
              ร้าน ฿{s.split.merchantNet} (หักคอม {pct(rates.commissionRate)} = ฿{s.split.commission}) ·
              ไรเดอร์ ฿{s.split.riderNet} (หักส่วนแบ่ง {pct(rates.deliveryShareRate)} = ฿{s.split.deliveryShare}) ·
              บริการ ฿{s.split.serviceFee}
            </span>
          )}
          <span className="a-note">{s.note}</span>
        </div>
      )}
    </article>
  );
}
