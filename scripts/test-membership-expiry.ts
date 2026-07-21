/**
 * deno run -A scripts/test-membership-expiry.ts
 */
import {
  checkMembershipForAccess,
  isPremiumPlanActive,
} from '../src/supabase/functions/server/subscription_helpers.tsx';

const past = new Date(Date.now() - 86400000).toISOString();
const future = new Date(Date.now() + 3 * 86400000).toISOString();

const cases = [
  { label: 'premium süresi dolmuş', u: { plan: 'premium', role: 'user', expiresAt: past }, active: false },
  { label: 'premium 3 gün kaldı', u: { plan: 'premium', role: 'user', expiresAt: future }, active: true },
  { label: 'premium süre yok', u: { plan: 'premium', role: 'user', expiresAt: null }, active: false },
  { label: 'admin', u: { plan: 'admin', role: 'admin', expiresAt: null }, active: true },
];

let ok = true;
for (const c of cases) {
  const active = isPremiumPlanActive(c.u);
  const gate = checkMembershipForAccess(c.u);
  const pass = active === c.active;
  if (!pass) ok = false;
  console.log(`${pass ? 'OK' : 'FAIL'} ${c.label}: active=${active} gate=${gate.allowed}`);
}

Deno.exit(ok ? 0 : 1);
