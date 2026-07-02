import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import './Login.css';
import { IconUser } from '../components/Icons';

// บัญชีเดโม (seed ฝั่ง api: รหัสผ่านเดียวกันทั้งหมด) — ปุ่มเติมให้ทดสอบเร็ว
const DEMO_ACCOUNTS = [
  { actorId: 'customer:aon', label: 'ลูกค้า' },
  { actorId: 'merchant:khao-man-kai', label: 'ร้าน' },
  { actorId: 'rider:somchai', label: 'ไรเดอร์' },
  { actorId: 'admin:root', label: 'แอดมิน' },
];
const DEMO_PASSWORD = 'demo1234';

export function Login() {
  const { state, login, logout } = useStore();
  const navigate = useNavigate();
  const [actorId, setActorId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError('');
    setBusy(true);
    try {
      await login(actorId, password);
      navigate('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'เข้าสู่ระบบไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <div className="m-top">
        <span className="m-who" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <IconUser size={18} /> เข้าสู่ระบบ
        </span>
        <Link className="m-back" to="/">‹ หน้าแรก</Link>
      </div>

      {state.auth ? (
        <section className="login-card" data-testid="login-status">
          <p className="login-hello">เข้าสู่ระบบเป็น <b>{state.auth.actorId}</b> <span className="login-role">({state.auth.role})</span></p>
          <button className="btn btn--ghost" data-testid="logout-btn" onClick={() => { void logout(); }}>ออกจากระบบ</button>
        </section>
      ) : (
        <section className="login-card">
          <label className="login-field">
            ผู้ใช้ (actorId)
            <input data-testid="login-actor" type="text" value={actorId} placeholder="เช่น customer:aon"
              onChange={(e) => setActorId(e.target.value)} />
          </label>
          <label className="login-field">
            รหัสผ่าน
            <input data-testid="login-password" type="password" value={password} placeholder="demo1234"
              onChange={(e) => setPassword(e.target.value)} />
          </label>
          <button className="btn btn--mango" data-testid="login-submit" disabled={busy || !actorId || !password}
            onClick={() => { void submit(); }}>{busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}</button>
          {error && <p className="login-error" data-testid="login-error">{error}</p>}

          <div className="login-demo">
            <span className="login-demo-h">บัญชีเดโม (รหัส {DEMO_PASSWORD}):</span>
            <div className="login-demo-row">
              {DEMO_ACCOUNTS.map((a) => (
                <button key={a.actorId} className="btn btn--ghost login-demo-btn"
                  onClick={() => { setActorId(a.actorId); setPassword(DEMO_PASSWORD); }}>{a.label}</button>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
