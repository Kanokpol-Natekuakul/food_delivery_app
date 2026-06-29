import type { OrderState } from '@app/domain/order/state.js';
import { orderView } from './orderView';
import type { Status } from './orderView';
import './OrderTracker.css';

const nodeClass = (s: Status) => `node is-${s}`;

export function OrderTracker({ state }: { state: OrderState }) {
  const v = orderView(state);
  const otpHint =
    v.otp === 'live' ? 'ไรเดอร์รออยู่หน้าบ้าน — แจ้งรหัสนี้ได้เลย'
      : v.otp === 'done' ? 'ยืนยันรับของเรียบร้อยแล้ว'
        : 'รหัสจะใช้ได้เมื่อไรเดอร์ถึงหน้าบ้าน';

  return (
    <div className="tracker">
      <h1 className="headline" aria-live="polite">{v.headline}</h1>
      <p className="sub">{v.sub}</p>
      {v.cancel && <span className="chip chip--mango chip-cancel">⏱ ยกเลิกฟรีได้อีก 04:46</span>}

      <div className="board">
        <div className="rail-heads">
          <div className="rail-head">🔥 ราง ร้าน</div>
          <div className="rail-head">🛵 ราง ไรเดอร์ <span className="who">สมชาย</span></div>
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
            <span className="ava">🛵</span>
            <div><div className="name">สมชาย ใจดี</div><div className="rate">★ 4.9</div></div>
          </div>
          <h2>รหัสรับของ</h2>
          <p>{otpHint}</p>
          <div className="otp-digits"><span>4</span><span>8</span><span>2</span><span>1</span></div>
          <button className="btn btn--chili otp__call">โทรหาไรเดอร์</button>
        </section>
      )}

      {v.terminal && (
        <div className="terminal">
          <span className="ic">{v.terminal.icon}</span>
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
