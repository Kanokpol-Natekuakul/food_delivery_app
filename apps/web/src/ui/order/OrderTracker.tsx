import type { OrderState } from '@app/domain/order/state.js';
import { orderView } from './orderView';
import type { Status } from './orderView';
import './OrderTracker.css';
import { IconTimer, IconFlame, IconMotorbike, IconStar, IconTrash, IconHourglass, IconDoor, IconWrench, IconAlertTriangle } from '../components/Icons';

const TERMINAL_ICONS: Record<string, JSX.Element> = {
  flame: <IconFlame size={28} />,
  trash: <IconTrash size={28} />,
  hourglass: <IconHourglass size={28} />,
  door: <IconDoor size={28} />,
  wrench: <IconWrench size={28} />,
};

const nodeClass = (s: Status) => `node is-${s}`;

export function OrderTracker({ state, riderName = 'สมชาย ใจดี' }: { state: OrderState; riderName?: string | undefined }) {
  const v = orderView(state);
  const otpHint =
    v.otp === 'live' ? 'ไรเดอร์รออยู่หน้าบ้าน — แจ้งรหัสนี้ได้เลย'
      : v.otp === 'done' ? 'ยืนยันรับของเรียบร้อยแล้ว'
        : 'รหัสจะใช้ได้เมื่อไรเดอร์ถึงหน้าบ้าน';

  const shortRiderName = state.kind === 'AwaitingHandoff' && state.rider === 'Unclaimed' 
    ? 'ยังไม่มี' 
    : (riderName.split(' ')[0] || 'สมชาย');

  return (
    <div className="tracker">
      <h1 className="headline" aria-live="polite">{v.headline}</h1>
      <p className="sub">{v.sub}</p>
      {v.cancel && (
        <span className="chip chip--mango chip-cancel">
          <IconTimer size={14} style={{ marginRight: '4px' }} /> ยกเลิกฟรีได้อีก 04:46
        </span>
      )}

      <div className="board">
        <div className="rail-heads">
          <div className="rail-head" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <IconFlame size={16} /> ราง ร้าน
          </div>
          <div className="rail-head" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <span className={`r-ride-ico${state.kind === 'InTransit' || (state.kind === 'AwaitingHandoff' && state.rider !== 'Unclaimed') ? ' is-riding' : ''}`} style={{ display: 'inline-flex', alignItems: 'center' }}>
              <IconMotorbike size={16} />
            </span>{' '}
            ราง ไรเดอร์ <span className="who">{shortRiderName}</span>
          </div>
        </div>

        <div className="parallel">
          <ol className="track">
            {v.kitchen.map((n, i) => (
              <li key={i} className={nodeClass(n.status)}><span className="dot" /><div className="label"><b>{n.label}</b></div></li>
            ))}
          </ol>
          <ol className="track">
            {v.rider.map((n, i) => (
              <li key={i} className={nodeClass(n.status)}><span className="dot" /><div className="label"><b>{n.label}</b></div></li>
            ))}
          </ol>
        </div>

        <div className={`merge is-${v.merge}`}>
          <svg className="funnel" viewBox="0 0 280 46" preserveAspectRatio="none" aria-hidden="true">
            <path d="M70 2 C70 28, 140 22, 140 44" />
            <path d="M210 2 C210 28, 140 22, 140 44" />
          </svg>
          <div className="diamond" />
          <div className="merge-label">{v.mergeTitle}{v.mergeSub && <small>{v.mergeSub}</small>}</div>
        </div>

        <ol className="track single">
          {v.single.map((n, i) => (
            <li key={i} className={nodeClass(n.status)}><span className="dot" /><div className="label"><b>{n.label}</b></div></li>
          ))}
        </ol>
      </div>

      {v.otp !== 'hide' && (
        <section className={`otp is-${v.otp}`} aria-label="รหัสรับของ">
          <div className="rider">
            <span className="ava" style={{ display: 'inline-flex', alignItems: 'center' }}><IconMotorbike size={20} /></span>
            <div>
              <div className="name">{riderName}</div>
              <div className="rate" style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                <IconStar size={12} /> 4.9
              </div>
            </div>
          </div>
          <h2>รหัสรับของ</h2>
          <p>{otpHint}</p>
          <div className="otp-digits"><span>4</span><span>8</span><span>2</span><span>1</span></div>
          <button className="btn btn--chili otp__call">โทรหาไรเดอร์</button>
        </section>
      )}

      {v.terminal && (
        <div className="terminal">
          <span className="ic" style={{ display: 'inline-flex', alignItems: 'center' }}>
            {TERMINAL_ICONS[v.terminal.icon] ?? <IconAlertTriangle size={28} />}
          </span>
          <div>
            <b>{v.terminal.title}</b>
            <p>{v.terminal.body}</p>
            <button className="btn btn--mango">{v.terminal.action}</button>
          </div>
        </div>
      )}
    </div>
  );
}
