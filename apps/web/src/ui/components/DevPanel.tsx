import { useState } from 'react';
import { useStore } from '../store';
import { IconWrench, IconAlertTriangle, IconClock } from './Icons';
import './DevPanel.css';

export function DevPanel() {
  const { state, dispatch, offlineQueue = [] } = useStore();
  const [collapsed, setCollapsed] = useState(true);

  const mockOffline = state.mockOffline ?? false;
  const simSpeed = state.simSpeed ?? 1;

  if (collapsed) {
    return (
      <button 
        className={`dev-trigger${mockOffline ? ' dev-trigger--offline' : ''}`}
        onClick={() => setCollapsed(false)}
        aria-label="เปิดแผงควบคุมระบบทดสอบ"
      >
        <IconWrench size={16} />
        {offlineQueue.length > 0 && (
          <span className="dev-trigger__badge">{offlineQueue.length}</span>
        )}
      </button>
    );
  }

  return (
    <div className="dev-panel" role="dialog" aria-label="แผงควบคุมการทดสอบ (Dev Dashboard)">
      <div className="dev-panel__head">
        <span className="dev-panel__title">
          <IconWrench size={14} /> แผงควบคุมนักพัฒนา
        </span>
        <button className="dev-panel__close" onClick={() => setCollapsed(true)}>✕</button>
      </div>

      <div className="dev-panel__body">
        {/* Toggle ออฟไลน์จำลอง */}
        <div className="dev-section">
          <div className="dev-row">
            <span className="dev-label">จำลองเน็ตหลุด (Mock Offline)</span>
            <button 
              className={`btn dev-toggle-btn ${mockOffline ? 'btn--chili' : 'btn--ghost'}`}
              onClick={() => dispatch({ type: 'toggleMockOffline' })}
            >
              {mockOffline ? 'เปิดอยู่ (Offline)' : 'ปิดอยู่ (Online)'}
            </button>
          </div>
          {offlineQueue.length > 0 && (
            <div className="dev-queue-warning">
              <IconAlertTriangle size={12} /> ค้างส่งเซิร์ฟเวอร์: <b>{offlineQueue.length} รายการ</b>
            </div>
          )}
        </div>

        {/* ปรับสปีดนาฬิกาจำลอง */}
        <div className="dev-section">
          <span className="dev-label block-label"><IconClock size={12} /> ความเร็วเวลา (Simulation Speed)</span>
          <div className="dev-speeds">
            {[1, 5, 15, 30].map((s) => (
              <button
                key={s}
                className={`btn dev-speed-btn ${simSpeed === s ? 'btn--mango' : 'btn--ghost'}`}
                onClick={() => dispatch({ type: 'setSimSpeed', speed: s })}
              >
                {s}x
              </button>
            ))}
          </div>
          <p className="dev-hint">เร่งรอบเวลานาฬิกาสิทธิ์คว้างาน และนาฬิกาขอบเขตติดตามออเดอร์</p>
        </div>

        {/* สถานะแอป (Diagnostic) */}
        <div className="dev-section dev-diagnostic">
          <div className="dev-diag-row">
            <span>สถานะเซสชัน:</span>
            <b>{state.auth ? `${state.auth.role} (${state.auth.actorId})` : 'ไม่ได้ล็อกอิน'}</b>
          </div>
          <div className="dev-diag-row">
            <span>รหัสออเดอร์สด:</span>
            <b className="mono-text">{state.liveOrderId || 'ไม่มีออเดอร์'}</b>
          </div>
          <div className="dev-diag-row">
            <span>สิทธิ์ไรเดอร์ออเดอร์สด:</span>
            <b>{state.liveRider === 'Unclaimed' ? 'ยังไม่มี' : (state.liveRider || 'ยังไม่มี')}</b>
          </div>
        </div>
      </div>
    </div>
  );
}
