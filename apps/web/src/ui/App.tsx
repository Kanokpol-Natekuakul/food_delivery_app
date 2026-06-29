import { Routes, Route } from 'react-router-dom';
import { Home } from './pages/Home';
import { Restaurant } from './pages/Restaurant';
import { Menu } from './pages/Menu';
import { Cart } from './pages/Cart';
import { Track } from './pages/Track';
import { Merchant } from './pages/Merchant';
import { MerchantMenu } from './pages/MerchantMenu';
import { MerchantRate } from './pages/MerchantRate';
import { Rider } from './pages/Rider';
import { Admin } from './pages/Admin';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/r/:restaurantId" element={<Restaurant />} />
      <Route path="/r/:restaurantId/:dishId" element={<Menu />} />
      <Route path="/cart" element={<Cart />} />
      <Route path="/track" element={<Track />} />
      <Route path="/merchant" element={<Merchant />} />
      <Route path="/merchant/menu" element={<MerchantMenu />} />
      <Route path="/merchant/rate" element={<MerchantRate />} />
      <Route path="/rider" element={<Rider />} />
      <Route path="/admin" element={<Admin />} />
    </Routes>
  );
}
