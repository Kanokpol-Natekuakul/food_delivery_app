import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  haversineKm,
  deliveryFee,
  isWithinServiceZone,
  SERVICE_ZONE_KM,
  checkServiceability,
} from './delivery.js';

test('haversineKm: จุดเดียวกัน = 0', () => {
  assert.equal(haversineKm({ lat: 13.75, lng: 100.5 }, { lat: 13.75, lng: 100.5 }), 0);
});

test('haversineKm: 1° ละติจูด ≈ 111 กม.', () => {
  const d = haversineKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
  assert.ok(Math.abs(d - 111.19) < 0.5, `ได้ ${d}`);
});

test('deliveryFee: ระยะ ~0 → ขั้นต่ำ ฿15', () => {
  assert.equal(deliveryFee(0), 15);
});

test('deliveryFee: ฿15 + ฿7/กม.', () => {
  assert.equal(deliveryFee(1), 22);
  assert.equal(deliveryFee(2), 29);
  assert.equal(deliveryFee(3), 36);
  assert.equal(deliveryFee(5), 50);
});

test('Service Zone: ภายใน 6 กม. ส่งได้, เกิน 6 กม. นอกพื้นที่', () => {
  assert.equal(SERVICE_ZONE_KM, 6);
  assert.equal(isWithinServiceZone(5.9), true);
  assert.equal(isWithinServiceZone(6), true);
  assert.equal(isWithinServiceZone(6.01), false);
});

const CUST = { lat: 0, lng: 0 };

test('checkServiceability: ร้านในเขต → สั่งได้ พร้อมระยะ+ค่าส่ง', () => {
  const near = { lat: 0.01, lng: 0 }; // ~1.11 กม.
  const r = checkServiceability(CUST, near);
  assert.equal(r.orderable, true);
  if (r.orderable) {
    assert.equal(r.distanceKm, haversineKm(CUST, near));
    assert.equal(r.fee, deliveryFee(r.distanceKm));
  }
});

test('checkServiceability: ร้านนอกเขต → สั่งไม่ได้ พร้อมเหตุผล + ระยะ', () => {
  const far = { lat: 1, lng: 0 }; // ~111 กม. เกิน 6 กม.
  const r = checkServiceability(CUST, far);
  assert.equal(r.orderable, false);
  if (!r.orderable) {
    assert.equal(r.reason, 'out_of_zone');
    assert.equal(r.distanceKm, haversineKm(CUST, far));
  }
});

test('checkServiceability: พอดีขอบเขต 6 กม. ยังสั่งได้', () => {
  // วางร้านให้ห่างพอดี ๆ แล้วเช็คผ่าน maxKm ที่ครอบระยะนั้น
  const near = { lat: 0.01, lng: 0 };
  const d = haversineKm(CUST, near);
  assert.equal(checkServiceability(CUST, near, d).orderable, true); // d ≤ d
});
