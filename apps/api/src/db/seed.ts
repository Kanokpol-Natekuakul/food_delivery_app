
/**
 * Seed runner — `tsx src/db/seed.ts` (หรือ `npm run db:seed`)
 * ใส่ร้าน+เมนูจาก @app/domain/catalog ลง DB (idempotent)
 */
import { seedCatalog } from '../services/catalog.js';
import { seedDemo, seedUsers } from '../services/demo.js';

const cat = await seedCatalog();
const demo = await seedDemo();
const users = await seedUsers();
console.log(`seeded: ${cat.restaurants} ร้าน, ${cat.dishes} เมนู | demo: ${demo.orders} ออเดอร์, ${demo.disputes} ร้องเรียน, ${demo.ledger} รายการบัญชี | users: ${users.users} (รหัสผ่าน '${users.password}')`);
process.exit(0);
