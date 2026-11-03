import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
// Backend URL is public (not a secret). Configured in Netlify environment variables.
const raw = (process.env.BACKEND_URL || '').trim().replace(/\/$/, '');
let rule='';
if (raw) {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash)
    throw new Error('BACKEND_URL debe ser https://nombre.onrender.com, sin rutas ni parámetros.');
  rule = `/api/*  ${url.origin}/api/:splat  200\n`;
} else console.warn('[Deploy] BACKEND_URL no configurada: solo podrás ver el frontend, sin API en Netlify.');
const dir=resolve('dist'); mkdirSync(dir,{recursive:true});
writeFileSync(resolve(dir, '_redirects'), `${rule}/*  /index.html  200\n`);
