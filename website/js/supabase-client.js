/** Compat: el sim y el sitio comparten la misma API de subida. */
export { uploadWork as uploadWorkToCloud, isCloudEnabled, validateExamCode } from './supabase-api.js';
export async function loadSupabaseConfig() {
  const m = await import('./supabase-config.js');
  return m.default || m;
}
export async function probeConnectivity() {
  const { isCloudEnabled } = await import('./supabase-api.js');
  const online = navigator.onLine;
  if (!online) return { browserOnline: false, configured: false, cloud: false, status: 'offline', message: 'Offline', latencyMs: null };
  const configured = isCloudEnabled();
  return {
    browserOnline: true,
    configured,
    cloud: configured,
    status: configured ? 'cloud' : 'local',
    message: configured ? 'Supabase configurado' : 'Solo local',
    latencyMs: null
  };
}
export function clearProbeCache() {}
export function isSupabaseEnabled() {
  return false;
}
