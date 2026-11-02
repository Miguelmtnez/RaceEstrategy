import { BlobReader, TextWriter, ZipReader } from '@zip.js/zip.js';

const MAX_CSV_BYTES = 20 * 1024 * 1024;

/** Extrae ÚNICAMENTE activities.csv: nunca envía el ZIP ni las rutas GPS al backend. */
export async function extractStravaCSV(file: File): Promise<string> {
  if (/\.csv$/i.test(file.name)) {
    if (file.size > MAX_CSV_BYTES) throw new Error('El CSV supera el límite de 20 MB.');
    return file.text();
  }
  if (!/\.zip$/i.test(file.name)) {
    throw new Error('Selecciona el ZIP de tu cuenta Strava o el archivo activities.csv.');
  }
  const reader = new ZipReader(new BlobReader(file), { useWebWorkers: false });
  try {
    const entries = await reader.getEntries();
    const csv = entries.find(entry => !entry.directory && /(?:^|\/)activities\.csv$/i.test(entry.filename));
    if (!csv || !csv.getData) throw new Error('No encontramos activities.csv dentro de este ZIP.');
    if (csv.uncompressedSize > MAX_CSV_BYTES) throw new Error('El CSV dentro del ZIP supera el límite de 20 MB.');
    const text = await csv.getData(new TextWriter());
    if (new Blob([text]).size > MAX_CSV_BYTES) throw new Error('El CSV descomprimido supera el límite de 20 MB.');
    return text;
  } finally {
    await reader.close();
  }
}
