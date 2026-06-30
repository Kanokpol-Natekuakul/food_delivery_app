import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useStore, deliveryCoord, deliveryLabel } from '../store';
import type { LatLng } from '@app/domain/delivery/delivery.js';
import './LocationPicker.css';

// ตำแหน่งสำเร็จรูปใกล้ย่านร้าน (ให้เห็นทั้งในเขต/นอกเขตจัดส่ง)
const PRESETS: { label: string; coord: LatLng }[] = [
  { label: 'ลาดพร้าว ซ.1', coord: { lat: 13.806, lng: 100.574 } },
  { label: 'ใจกลางย่านร้าน', coord: { lat: 13.80, lng: 100.57 } },
  { label: 'ขอบโซนนอก (ใกล้ข้าวต้มโต้รุ่ง)', coord: { lat: 13.86, lng: 100.62 } },
];

/** เลือก/ปักหมุดที่อยู่จัดส่งบนแผนที่จริง (Leaflet + OpenStreetMap) → setDeliveryLocation */
export function LocationPicker({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useStore();
  const mapElRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const [coord, setCoord] = useState<LatLng>(deliveryCoord(state));
  const [label, setLabel] = useState<string>(deliveryLabel(state));

  useEffect(() => {
    if (!mapElRef.current) return;
    const start = deliveryCoord(state);
    const map = L.map(mapElRef.current).setView([start.lat, start.lng], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap', maxZoom: 19,
    }).addTo(map);

    // หมุดร้าน (ดึงจาก state.restaurants — ข้อมูล API จริง)
    for (const r of state.restaurants) {
      L.marker([r.coord.lat, r.coord.lng], {
        icon: L.divIcon({ className: 'lp-shop', html: `<span>${r.icon}</span>`, iconSize: [28, 28] }),
      }).addTo(map).bindTooltip(r.name);
    }

    // หมุดที่อยู่จัดส่ง — ลากได้ + คลิกแผนที่เพื่อย้าย
    const marker = L.marker([start.lat, start.lng], {
      draggable: true,
      icon: L.divIcon({ className: 'lp-pin', html: '📍', iconSize: [30, 30], iconAnchor: [15, 28] }),
    }).addTo(map);
    const moveTo = (ll: L.LatLng) => { setCoord({ lat: ll.lat, lng: ll.lng }); setLabel('ตำแหน่งที่ปักหมุด'); };
    marker.on('dragend', () => moveTo(marker.getLatLng()));
    map.on('click', (e: L.LeafletMouseEvent) => { marker.setLatLng(e.latlng); moveTo(e.latlng); });
    markerRef.current = marker;

    return () => { map.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const usePreset = (p: { label: string; coord: LatLng }) => {
    setCoord(p.coord); setLabel(p.label);
    markerRef.current?.setLatLng([p.coord.lat, p.coord.lng]);
  };

  const confirm = () => {
    dispatch({ type: 'setDeliveryLocation', coord, label: label.trim() || 'ตำแหน่งที่ปักหมุด' });
    onClose();
  };

  return (
    <div className="lp-scrim" onClick={onClose}>
      <div className="lp" role="dialog" aria-label="เลือกที่อยู่จัดส่ง" onClick={(e) => e.stopPropagation()}>
        <div className="lp-head">
          <b>📍 ที่อยู่จัดส่ง</b>
          <button className="icon-btn" aria-label="ปิด" onClick={onClose}>✕</button>
        </div>
        <div className="lp-map" ref={mapElRef} data-testid="lp-map" />
        <div className="lp-presets">
          {PRESETS.map((p) => (
            <button key={p.label} type="button" className="btn btn--ghost" onClick={() => usePreset(p)}>{p.label}</button>
          ))}
        </div>
        <label className="lp-field">ชื่อสถานที่
          <input value={label} onChange={(e) => setLabel(e.target.value)} />
        </label>
        <p className="lp-coord">พิกัด {coord.lat.toFixed(4)}, {coord.lng.toFixed(4)} — ลากหมุด 📍 หรือคลิกแผนที่เพื่อย้าย</p>
        <button type="button" className="btn btn--mango lp-confirm" onClick={confirm}>ใช้ที่อยู่นี้</button>
      </div>
    </div>
  );
}
