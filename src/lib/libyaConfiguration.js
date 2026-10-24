const PROJECT_REF = /^[a-z0-9]{20}$/;

// Se ejecuta también en el navegador: un artefacto de Libia mal configurado
// debe fallar antes de crear el cliente Supabase.
export const validateLibyaConfiguration = (env = {}) => {
  if (env.MODE !== 'libya' && env.VITE_DEPLOYMENT_ID !== 'libya') return;
  const ref = String(env.VITE_LIBYA_PROJECT_REF || '').trim();
  const caudalRef = String(env.VITE_CAUDAL_PROJECT_REF || '').trim();
  const url = String(env.VITE_SUPABASE_URL || '').trim();
  const clubName = String(env.VITE_OWN_CLUB_NAME || '').trim();
  if (env.VITE_DEPLOYMENT_ID !== 'libya'
    || !PROJECT_REF.test(ref) || !PROJECT_REF.test(caudalRef) || ref === caudalRef
    || url !== `https://${ref}.supabase.co`
    || !String(env.VITE_SUPABASE_ANON_KEY || '').trim()
    || env.VITE_MULTICLUB_03_CTS_ENABLED !== 'false'
    || !clubName || /caudal/i.test(clubName)) {
    throw new Error('Instalación Libia bloqueada: revisar proyecto, URL, identidad y modo CTS.');
  }
};
