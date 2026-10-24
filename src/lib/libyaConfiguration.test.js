import assert from 'node:assert/strict';
import { validateLibyaConfiguration } from './libyaConfiguration.js';

const valid = {
  MODE: 'libya', VITE_DEPLOYMENT_ID: 'libya',
  VITE_LIBYA_PROJECT_REF: 'abcdefghijklmnopqrst',
  VITE_CAUDAL_PROJECT_REF: 'tsrqponmlkjihgfedcba',
  VITE_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'public-test-key',
  VITE_MULTICLUB_03_CTS_ENABLED: 'false',
  VITE_OWN_CLUB_NAME: 'Equipo de Libia',
};
assert.doesNotThrow(() => validateLibyaConfiguration(valid));
assert.doesNotThrow(() => validateLibyaConfiguration({}));
for (const patch of [
  { VITE_LIBYA_PROJECT_REF: valid.VITE_CAUDAL_PROJECT_REF },
  { VITE_SUPABASE_URL: `https://${valid.VITE_CAUDAL_PROJECT_REF}.supabase.co` },
  { VITE_MULTICLUB_03_CTS_ENABLED: 'true' },
  { VITE_DEPLOYMENT_ID: '' },
  { VITE_OWN_CLUB_NAME: 'Caudal' },
  { VITE_SUPABASE_ANON_KEY: '' },
]) {
  assert.throws(() => validateLibyaConfiguration({ ...valid, ...patch }));
}
console.log('Libya configuration tests passed');
