// Ejecuta el artefacto real con la misma función de inferencia que usa la web.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const [modelPath, backendPath] = process.argv.slice(2);
const { predictFromModel } = await import(pathToFileURL(backendPath).href);
const model = JSON.parse(readFileSync(modelPath, 'utf8'));
const rows = JSON.parse(readFileSync(0, 'utf8'));
const predicted = rows.map(features => predictFromModel(model, {
  features, baselineMinutes: features[0] * features[4], historyCount: features[3]
}).estimatedMinutes);
process.stdout.write(JSON.stringify(predicted));
