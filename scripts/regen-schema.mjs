#!/usr/bin/env node
/**
 * Regenera supabase/schema.sql (estado acumulado) a partir de
 * supabase/migrations/000{1..N}_*.sql, cortando de cada archivo su tramo
 * de registro ("Aplicada: registrar versión N") y su REVERSIÓN.
 *
 * Uso: node scripts/regen-schema.mjs
 * Después de añadir una migración nueva, correr esto y verificar el diff.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const MIG = path.join(ROOT, 'supabase', 'migrations');
const OUT = path.join(ROOT, 'supabase', 'schema.sql');

const files = readdirSync(MIG)
  .filter((f) => /^\d{4}_.*\.sql$/.test(f))
  .sort();

function strip(name) {
  let s = readFileSync(path.join(MIG, name), 'utf8');
  if (name.startsWith('0001_')) {
    s = s.split('-- ============ WAVE 6 §6.4 ============')[0];
  } else {
    const idx = s.indexOf('-- Aplicada: registrar versión');
    if (idx !== -1) s = s.slice(0, idx);
    // quitar también la línea de separación que abre el bloque: no hace falta
  }
  return s.trimEnd() + '\n\n';
}

const header = `-- FísicaHN — esquema ACUMULADO (generado por scripts/regen-schema.mjs).
-- NO editar a mano. Es el resultado de aplicar ${files.length} migraciones
-- (${files[0]} … ${files.at(-1)}) en orden; sirve para entornos NUEVOS y para
-- leer el esquema real. Los entornos existentes NO se tocan con este archivo:
-- se migran aplicando 0002…${files.at(-1)} en orden tras la 0001 congelada
-- (ver supabase/README.md).
--
`;

const out = header + files.map(strip).join('');
writeFileSync(OUT, out);
console.log(`schema.sql regenerado con ${files.length} migraciones (${out.split('\n').length} líneas).`);