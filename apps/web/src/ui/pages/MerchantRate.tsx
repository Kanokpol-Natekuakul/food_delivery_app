import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore, merchantRestaurantId } from '../store';
import type { RateRequestStatus } from '@app/domain/revenue/revenue.js';
import { findRestaurant, ratesFor, merchantOverrides } from '../data/catalog';
import './MerchantRate.css';

const STATUS_LABEL: Record<RateRequestStatus, string> = {
  pending: 'รออนุมัติ', countered: 'แอดมินเสนอแย้ง', approved: 'อนุมัติแล้ว', rejected: 'ถูกปฏิเสธ',
};

export function MerchantRate() {
  const { state, dispatch } = useStore();
  const merchantId = merchantRestaurantId(state); // จาก session ถ้าล็อกอินเป็น merchant ไม่งั้น fallback เดโม
  const restaurant = findRestaurant(state.restaurants, merchantId);
  const rates = ratesFor(restaurant, merchantOverrides(state.rateOverrides));
  const currentPct = Math.round(rates.commissionRate * 100);

  const [proposed, setProposed] = useState(Math.max(1, currentPct - 5));
  const [reason, setReason] = useState('');

  const myRequests = state.rateRequests.filter((q) => q.merchantId === merchantId);
  const valid = proposed > 0 && proposed < currentPct;

  const submit = () => {
    dispatch({
      type: 'submitRateRequest',
      merchantId,
      currentRate: rates.commissionRate,
      proposedRate: proposed / 100,
      reason,
    });
    setReason('');
  };

  return (
    <div className="mrate">
      <div className="m-top">
        <span className="m-who">💸 ค่าคอมมิชชัน{restaurant ? ` · ${restaurant.name}` : ''}</span>
        <Link className="m-back" to="/merchant">‹ คอนโซลร้าน</Link>
      </div>

      <section className="mrate-now">
        <div className="mrate-row">
          <span className="mrate-k">คอมมิชชันปัจจุบัน (หักจากค่าอาหาร)</span>
          <span className="mrate-v" data-testid="current-commission">{currentPct}%</span>
        </div>
        <div className="mrate-row">
          <span className="mrate-k">ส่วนแบ่งค่าส่ง (แพลตฟอร์มกำหนด · เจรจาไม่ได้)</span>
          <span className="mrate-v mrate-v--mut">{Math.round(rates.deliveryShareRate * 100)}%</span>
        </div>
      </section>

      <section className="mrate-form">
        <h2 className="m-h2">ยื่นขอลดค่าคอม</h2>
        <label className="mrate-field">
          เสนออัตราใหม่ (%)
          <input type="number" min={1} max={currentPct - 1} value={proposed}
            onChange={(e) => setProposed(Number(e.target.value))} />
        </label>
        <label className="mrate-field">
          เหตุผล (เช่น ยอดขายสูง/ลูกค้าประจำ)
          <input type="text" value={reason} placeholder="เหตุผลประกอบการเจรจา"
            onChange={(e) => setReason(e.target.value)} />
        </label>
        <button className="btn btn--mango" disabled={!valid} onClick={submit}>ส่งคำขอ</button>
        {!valid && <p className="mrate-hint">ต้องเสนอต่ำกว่าอัตราปัจจุบัน ({currentPct}%) และมากกว่า 0</p>}
      </section>

      <section className="mrate-list">
        <h2 className="m-h2">คำขอของร้าน ({myRequests.length})</h2>
        {myRequests.length === 0 && <p className="mrate-empty">ยังไม่เคยยื่นคำขอ</p>}
        {myRequests.map((q) => (
          <div className="mrate-item" key={q.id}>
            <div className="mrate-iteminfo">
              <span className="mrate-move">คอม {Math.round(q.currentRate * 100)}% → <b>{Math.round(q.proposedRate * 100)}%</b></span>
              {q.counterRate !== undefined && (
                <span className="mrate-counter">แอดมินเสนอแย้ง {Math.round(q.counterRate * 100)}%</span>
              )}
            </div>
            {q.status === 'countered' ? (
              <div className="mrate-respond">
                <button className="btn btn--mango" aria-label={`ตอบรับข้อเสนอแย้ง ${q.id}`}
                  onClick={() => dispatch({ type: 'acceptCounterOffer', id: q.id })}>ตอบรับ</button>
                <button className="btn btn--ghost" aria-label={`ปฏิเสธข้อเสนอแย้ง ${q.id}`}
                  onClick={() => dispatch({ type: 'declineCounterOffer', id: q.id })}>ปฏิเสธ</button>
              </div>
            ) : (
              <span className={`mrate-badge mrate-badge--${q.status}`}>{STATUS_LABEL[q.status]}</span>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
