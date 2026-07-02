import { Link } from 'react-router-dom';
import { useStore, deliveryCoord, deliveryLabel } from '../store';
import { checkServiceability } from '@app/domain/delivery/delivery.js';
import './AllRestaurants.css';
import { IconUtensils, IconPin } from '../components/Icons';

/** หน้ารวมร้านทั้งหมด — render จาก state.restaurants (ข้อมูล hydrate จาก API จริง) */
export function AllRestaurants() {
  const { state } = useStore();
  const coord = deliveryCoord(state);

  return (
    <div className="allr">
      <div className="allr-top">
        <Link className="m-back" to="/">‹ หน้าแรก</Link>
        <span className="allr-title" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <IconUtensils size={18} /> ร้านอาหารทั้งหมด ({state.restaurants.length})
        </span>
      </div>
      <p className="allr-loc" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
        <IconPin size={13} /> ส่งที่ {deliveryLabel(state)}
      </p>

      <div className="allr-list">
        {state.restaurants.map((r) => {
          const offzone = !checkServiceability(coord, r.coord).orderable;
          return (
            <Link className="allr-row" to={`/r/${r.id}`} key={r.id}>
              <div className={`allr-thumb ${r.g}`}>{r.icon}</div>
              <div className="allr-info">
                <h3>{r.name}</h3>
                <p className="allr-blurb">{r.blurb}</p>
                <div className="allr-meta">
                  <span className="rate">{r.rating}</span>
                  <span>{r.cat}</span>
                  {offzone && <span className="offzone">นอกพื้นที่</span>}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
