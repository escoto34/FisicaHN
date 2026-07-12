/**
 * Copia este archivo a supabase-config.js y rellena tus valores.
 *
 *   cp website/js/supabase-config.example.js website/js/supabase-config.js
 *
 * SOLO la anon/public key. NUNCA la service_role en el frontend ni en el repo.
 * En GitHub Pages usa secrets del workflow (ver .github/workflows/deploy-pages.yml).
 *
 * Dónde obtenerlas:
 *   Supabase Dashboard → Project Settings → API
 *   - Project URL  → url
 *   - anon public  → anonKey
 */
export default {
  /** Ej: https://xxxxxxxxxxxx.supabase.co */
  url: 'https://YOUR_PROJECT_REF.supabase.co',
  /** JWT anon public (empieza por eyJ...) */
  anonKey: 'YOUR_SUPABASE_ANON_KEY',
  /** false fuerza modo solo-local aunque haya keys */
  enabled: true
};
