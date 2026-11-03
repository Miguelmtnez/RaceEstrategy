// Comprobador de integridad de la entrega. No instala paquetes ni accede a Internet.
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const files = [
  'backend/package.json', 'backend/src.js', 'backend/metrics.js',
  'backend/strava-import.js', 'backend/activity-list.js', 'backend/profile-analytics.js', 'backend/.env.example',
  'frontend/package.json', 'frontend/index.html', 'frontend/vite.config.ts',
  'frontend/tsconfig.json', 'frontend/src/main.tsx', 'frontend/src/styles.css',
  'frontend/src/components/CrashBoundary.tsx', 'frontend/src/components/Brand.tsx',
  'frontend/src/lib/api.ts', 'frontend/src/lib/importStrava.ts',
  'frontend/src/pages/AuthPage.tsx', 'frontend/src/pages/DashboardPage.tsx',
  'frontend/src/pages/ActivitiesPage.tsx', 'frontend/src/pages/ProfilePage.tsx', 'frontend/src/components/Sidebar.tsx',
  'frontend/public/_redirects', 'frontend/public/preview-actividades.html'
];
const missing = files.filter(rel => !fs.existsSync(path.join(root, rel)));
for (const rel of files) console.log(`${missing.includes(rel) ? '[FALTA]' : '[OK]   '} ${rel}`);
if (missing.length) {
  console.error(`\nFaltan ${missing.length} archivos: extrae el ZIP completo dentro de la carpeta RaceEstrategy.`);
  process.exitCode = 1;
} else {
  console.log('\nTodo correcto: están los archivos básicos de frontend y backend.');
}
