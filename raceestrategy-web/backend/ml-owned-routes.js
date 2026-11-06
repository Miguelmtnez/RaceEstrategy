// RaceEstrategy ML v1.4: selección personal y persistente de actividades para inferencia con Supabase.
// SOLO datos aportados manualmente: no consulta tablas de sincronización de la API de Strava.
import express from 'express';
import { decodeFitUpload, MAX_FIT_UPLOAD_BYTES } from './fit-import.js';
import { predictionForIndependentHistory } from './ml-predict.js';
import { validRunningFit, summarizeOwnedRows } from './ml-owned-metrics.js';
import { parseUserStravaArchiveCsv } from './ml-archive-import.js';

const LIMIT_ACTIVITIES = 2500;

function httpError(message, status = 400) {
  const e = new Error(message);
  e.status = status;
  return e;
}

function validateArchive(text) {
  if (typeof text !== 'string' || !text.trim()) throw httpError('No hemos recibido activities.csv.');
  const data = parseUserStravaArchiveCsv(text);
  if (!data.stats.selectedRunning) throw httpError('No encontramos actividades de Carrera en activities.csv.', 422);
  if (data.rows.length > LIMIT_ACTIVITIES) throw httpError(`El archivo contiene más de ${LIMIT_ACTIVITIES} carreras válidas. Divide el historial antes de importarlo.`, 413);
  return data;
}

function formatRow(r) {
  return {
    id: r.content_id,
    name: r.activity_name || 'Carrera',
    date: r.activity_date,
    sport: r.sport,
    distanceKm: r.distance_km,
    durationMinutes: r.duration_minutes,
    ascentM: r.ascent_m,
    selected: Number(r.use_for_prediction) === 1,
    source: r.content_id.startsWith('fit_') ? 'fit' : 'archivo'
  };
}

function isContentId(id) {
  return typeof id === 'string' && /^(?:archive_strava_\d{1,20}|fit_[a-f0-9]{24})$/.test(id);
}

export function mountMlOwnedRoutes(app, account, dbService) {
  function fail(res, e, context) {
    if (!e.status) console.error(`[${context}]`, e?.message || e);
    return res.status(e.status || 500).json({ error: e.status ? e.message : 'No se pudo completar la operación.' });
  }

  async function rows(userId) {
    return dbService.getMlOwnedActivities(userId, LIMIT_ACTIVITIES);
  }

  async function preview(userId, rawCsv) {
    const { rows: running, stats } = validateArchive(rawCsv);
    const existingRows = await rows(userId);
    const byId = new Map(existingRows.map(r => [r.content_id, r]));

    const items = running.map(r => {
      let stored = byId.get(r.contentId);
      if (!stored) {
        stored = existingRows.find(x => x.content_id.startsWith('fit_') && x.activity_date === r.date &&
          Math.abs(x.distance_km - r.distanceKm) < 0.02 && Math.abs(x.duration_minutes - r.durationMinutes) < 0.25);
      }
      return { ...r, selected: stored ? Number(stored.use_for_prediction) === 1 : true, alreadyImported: !!stored };
    });
    return { ok: true, ...stats, items };
  }

  async function saveArchive(userId, rawCsv, chosenIds) {
    const { rows: running, stats } = validateArchive(rawCsv);
    if (chosenIds !== null) {
      if (!Array.isArray(chosenIds) || chosenIds.length > LIMIT_ACTIVITIES || chosenIds.some(id => !isContentId(id) || !id.startsWith('archive_strava_')))
        throw httpError('La selección de actividades no es válida.');
      const validIds = new Set(running.map(x => x.contentId));
      if (chosenIds.some(id => !validIds.has(id)) || new Set(chosenIds).size !== chosenIds.length)
        throw httpError('La selección contiene actividades ajenas al archivo o identificadores repetidos.');
    }
    const allowed = chosenIds === null ? null : new Set(chosenIds);

    const existingRows = await rows(userId);
    const byId = new Map(existingRows.map(r => [r.content_id, r]));

    let currentCount = existingRows.length;
    let added = 0;
    let duplicates = 0;

    for (const row of running) {
      const selected = allowed === null ? 1 : Number(allowed.has(row.contentId));
      let existing = byId.get(row.contentId);
      if (!existing) {
        existing = existingRows.find(x => x.content_id.startsWith('fit_') && x.activity_date === row.date &&
          Math.abs(x.distance_km - row.distanceKm) < 0.02 && Math.abs(x.duration_minutes - row.durationMinutes) < 0.25);
      }

      if (existing) {
        await dbService.upsertMlOwnedActivity({
          user_id: userId,
          content_id: existing.content_id,
          activity_date: existing.activity_date,
          sport: existing.sport,
          distance_km: existing.distance_km,
          duration_minutes: existing.duration_minutes,
          ascent_m: existing.ascent_m,
          attested_at: Date.now(),
          activity_name: row.name,
          use_for_prediction: selected
        });
        duplicates++;
        continue;
      }

      if (currentCount >= LIMIT_ACTIVITIES) {
        throw httpError(`Has alcanzado el límite de ${LIMIT_ACTIVITIES} actividades del Laboratorio IA.`, 413);
      }

      await dbService.upsertMlOwnedActivity({
        user_id: userId,
        content_id: row.contentId,
        activity_date: row.date,
        sport: row.sport,
        distance_km: row.distanceKm,
        duration_minutes: row.durationMinutes,
        ascent_m: row.ascentM,
        attested_at: Date.now(),
        activity_name: row.name,
        use_for_prediction: selected
      });
      added++;
      currentCount++;
    }

    const updatedRows = await rows(userId);
    return {
      ok: true,
      ...stats,
      added,
      duplicates,
      count: currentCount,
      selectedCount: updatedRows.filter(x => Number(x.use_for_prediction) === 1).length,
      notice: 'Las carreras excluidas quedan guardadas, pero se omiten del perfil y de las predicciones. No se guardan GPS ni pulsaciones.'
    };
  }

  app.get('/api/ml/owned-profile', account, async (req, res) => {
    try {
      const userRows = await rows(req.user.id);
      res.json(summarizeOwnedRows(userRows));
    } catch (e) {
      fail(res, e, 'ML profile');
    }
  });

  app.get('/api/ml/owned-activities', account, async (req, res) => {
    try {
      const userRows = await rows(req.user.id);
      const items = userRows.map(formatRow);
      res.json({ items, total: items.length, selected: items.filter(x => x.selected).length, limit: LIMIT_ACTIVITIES });
    } catch (e) {
      fail(res, e, 'ML activities');
    }
  });

  app.post('/api/ml/owned-selection', account, express.text({ type: 'text/plain', limit: '80kb' }), async (req, res) => {
    try {
      const { ids, selected } = JSON.parse(req.body || '{}');
      if (!Array.isArray(ids) || ids.length < 1 || ids.length > LIMIT_ACTIVITIES || typeof selected !== 'boolean'
        || ids.some(id => !isContentId(id)) || new Set(ids).size !== ids.length) {
        throw httpError('Envía identificadores de actividad únicos y selected=true/false.');
      }
      await dbService.updateMlOwnedSelection(req.user.id, ids, selected);
      const items = await rows(req.user.id);
      res.json({ ok: true, changed: ids.length, selectedCount: items.filter(x => Number(x.use_for_prediction) === 1).length });
    } catch (e) {
      if (e instanceof SyntaxError) e.status = 400;
      fail(res, e, 'ML selection');
    }
  });

  app.post('/api/ml/owned-fit', account, express.raw({ type: 'application/octet-stream', limit: '15mb' }), async (req, res) => {
    if (req.headers['x-ml-independent-consent'] !== 'true') return res.status(400).json({ error: 'Confirma que el FIT procede de un dispositivo y autorizas su análisis.' });
    const filename = typeof req.query.filename === 'string' ? req.query.filename.slice(0, 260) : '';
    if (!/\.fit(?:\.gz)?$/i.test(filename) || !Buffer.isBuffer(req.body) || req.body.length < 1 || req.body.length > MAX_FIT_UPLOAD_BYTES)
      return res.status(400).json({ error: 'Selecciona un FIT/FIT.GZ de hasta 15 MB.' });
    try {
      const decoded = await decodeFitUpload(req.body, filename);
      const fit = validRunningFit(decoded);
      const existing = await dbService.getMlOwnedActivityById(req.user.id, fit.contentId);
      const userRows = await rows(req.user.id);
      if (existing) return res.json({ ok: true, alreadyImported: true, date: fit.date, distanceKm: +fit.distanceKm.toFixed(2), count: userRows.length });
      if (userRows.length >= LIMIT_ACTIVITIES) throw httpError('Has alcanzado el máximo de actividades guardadas.', 413);
      await dbService.upsertMlOwnedActivity({
        user_id: req.user.id,
        content_id: fit.contentId,
        activity_date: fit.date,
        sport: fit.sport,
        distance_km: fit.distanceKm,
        duration_minutes: fit.durationMinutes,
        ascent_m: fit.ascentM,
        attested_at: Date.now(),
        activity_name: `Carrera FIT · ${fit.date}`,
        use_for_prediction: 1
      });
      res.json({ ok: true, alreadyImported: false, date: fit.date, distanceKm: +fit.distanceKm.toFixed(2), count: userRows.length + 1 });
    } catch (e) {
      fail(res, e, 'ML FIT');
    }
  });

  app.post('/api/ml/owned-strava-preview', account, express.text({ type: 'text/csv', limit: '24mb' }), async (req, res) => {
    if (req.headers['x-ml-user-file-consent'] !== 'true') return res.status(400).json({ error: 'Autoriza primero el análisis del archivo que aportas.' });
    try {
      const result = await preview(req.user.id, req.body);
      res.json(result);
    } catch (e) {
      if (!e.status && /csv|actividad|columna|filas|comillas|strava|export/i.test(e.message)) e.status = 400;
      fail(res, e, 'ML ZIP preview');
    }
  });

  app.post('/api/ml/owned-strava-archive', account, express.text({ type: 'text/csv', limit: '24mb' }), async (req, res) => {
    if (req.headers['x-ml-user-file-consent'] !== 'true') return res.status(400).json({ error: 'Autoriza primero el análisis del archivo que aportas.' });
    try {
      const result = await saveArchive(req.user.id, req.body, null);
      res.json(result);
    } catch (e) {
      if (!e.status && /csv|actividad|columna|filas|comillas|strava|export/i.test(e.message)) e.status = 400;
      fail(res, e, 'ML ZIP legacy');
    }
  });

  app.post('/api/ml/owned-strava-archive-selection', account, express.text({ type: 'text/plain', limit: '32mb' }), async (req, res) => {
    if (req.headers['x-ml-user-file-consent'] !== 'true') return res.status(400).json({ error: 'Autoriza primero el análisis del archivo que aportas.' });
    try {
      if (typeof req.body !== 'string' || req.body.length > 32 * 1024 * 1024) throw httpError('Archivo demasiado grande.', 413);
      const data = JSON.parse(req.body);
      if (!data || typeof data.csv !== 'string' || !Array.isArray(data.selectedIds)) throw httpError('Formato de selección inválido.');
      const result = await saveArchive(req.user.id, data.csv, data.selectedIds);
      res.json(result);
    } catch (e) {
      if (e instanceof SyntaxError) e.status = 400;
      if (!e.status && /csv|actividad|columna|filas|comillas|strava|export/i.test(e.message)) e.status = 400;
      fail(res, e, 'ML ZIP selected');
    }
  });

  app.post('/api/ml/predict-owned', account, async (req, res) => {
    try {
      const userRows = await rows(req.user.id);
      const chosen = userRows.filter(r => Number(r.use_for_prediction) === 1);
      const history = chosen.map(r => ({
        date: r.activity_date,
        distanceKm: r.distance_km,
        durationMinutes: r.duration_minutes,
        ascentM: r.ascent_m
      }));
      const result = predictionForIndependentHistory({
        source: 'manual_user_file',
        explicitConsent: true,
        history,
        route: req.body?.route
      });
      res.json({
        ...result,
        selectedActivities: chosen.length,
        historyLastDate: [...history].sort((a, b) => a.date.localeCompare(b.date)).at(-1)?.date || null,
        origin: 'manual_uploaded_archive_or_fit_no_api',
        caveat: 'Predicción experimental de Carrera con SOLO las actividades marcadas y anteriores a la ruta objetivo. El error medio FitRec no garantiza tu error individual.'
      });
    } catch (e) {
      fail(res, e, 'ML predict');
    }
  });

  app.delete('/api/ml/owned-history', account, async (req, res) => {
    try {
      const removed = await dbService.deleteMlOwnedActivities(req.user.id);
      res.json({ ok: true, removed });
    } catch (e) {
      fail(res, e, 'ML delete');
    }
  });
}
