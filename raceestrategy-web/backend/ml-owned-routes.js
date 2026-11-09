// RaceEstrategy: Laboratorio IA con persistencia Supabase.
// Solo actividades proporcionadas mediante archivos por el usuario; nunca consume Strava API.
import express from 'express';
import { decodeFitUpload, MAX_FIT_UPLOAD_BYTES } from './fit-import.js';
import { predictionForIndependentHistory } from './ml-predict.js';
import { validOwnedFit, summarizeOwnedRows } from './ml-owned-metrics.js';
import { OWNED_SPORTS, isOwnedSport } from './ml-sports.js';
import { projectComparableSessions } from './ml-sport-projection.js';
import { makeOwnedRating } from './ml-rating.js';
import { mergeManualRatingHistory } from './ml-rating-history.js';
import { analyzeManualHistory } from './ml-manual-history.js';
import { parseUserStravaArchiveCsv } from './ml-archive-import.js';
import { isActivityType, defaultTypeForName } from './ml-activity-types.js';
import { historicalCompetitionProjection } from './ml-race-projection.js';

const LIMIT_ACTIVITIES = 2500;
const SPORT_LABELS = OWNED_SPORTS.join(', ');
const ORIGIN = 'manual_uploaded_archive_or_fit_no_api';
function httpError(message, status = 400) { const e = new Error(message); e.status = status; return e; }
function isContentId(id) { return typeof id === 'string' && /^(?:archive_strava_\d{1,20}|fit_[a-f0-9]{24})$/.test(id); }
function boolSelected(row) { return Number(row.use_for_prediction) === 1; }
function validateSport(sport) { if (!isOwnedSport(sport)) throw httpError(`Selecciona ${SPORT_LABELS}.`); return sport; }
function validateArchive(text) {
  if (typeof text !== 'string' || !text.trim()) throw httpError('No hemos recibido activities.csv.');
  const data = parseUserStravaArchiveCsv(text);
  if (!data.rows.length) throw httpError('No hay actividades válidas de Carrera, Bicicleta, MTB o Senderismo en activities.csv.', 422);
  if (data.rows.length > LIMIT_ACTIVITIES) throw httpError(`El archivo supera ${LIMIT_ACTIVITIES} actividades válidas.`, 413);
  return data;
}
function formatRow(r) {
  return { id: r.content_id, name: r.activity_name || r.sport || 'Actividad', date: r.activity_date,
    sport: r.sport, distanceKm: r.distance_km, durationMinutes: r.duration_minutes,
    ascentM: r.ascent_m, selected: boolSelected(r),
    activityType: r.activity_type || 'sin_clasificar', typeSource: r.type_source || 'unset',
    source: r.content_id.startsWith('fit_') ? 'fit' : 'archivo' };
}
function findEquivalentFit(list, r) {
  return list.find(x => x.content_id.startsWith('fit_') && x.sport === r.sport && x.activity_date === r.date &&
    Math.abs(Number(x.distance_km) - r.distanceKm) < 0.02 &&
    Math.abs(Number(x.duration_minutes) - r.durationMinutes) < 0.25);
}
function newRow(userId, r, selected = 1, forcedType = null) {
  const suggested = defaultTypeForName(r.name);
  const manual = forcedType !== null;
  return { user_id: userId, content_id: r.contentId, activity_date: r.date, sport: r.sport,
    distance_km: r.distanceKm, duration_minutes: r.durationMinutes, ascent_m: r.ascentM,
    attested_at: Date.now(), activity_name: r.name,
    use_for_prediction: selected, activity_type: manual ? forcedType : suggested.activityType,
    type_source: manual ? 'manual' : suggested.typeSource };
}

export function mountMlOwnedRoutes(app, account, dbService) {
  function fail(res, e, context) {
    if (!e?.status) console.error(`[${context}]`, e);
    return res.status(e?.status || 500).json({ error: e?.status ? e.message : 'No se pudo completar la operación.' });
  }
  async function rows(userId) { return dbService.getMlOwnedActivities(userId, LIMIT_ACTIVITIES); }
  async function general(userId) { return dbService.getImportedActivities(userId); }

  async function preview(userId, csv) {
    const { rows: candidates, stats } = validateArchive(csv);
    const existing = await rows(userId);
    const byId = new Map(existing.map(r => [r.content_id, r]));
    const items = candidates.map(r => {
      const stored = byId.get(r.contentId) || findEquivalentFit(existing, r);
      const guess = defaultTypeForName(r.name);
      return { ...r, selected: stored ? boolSelected(stored) : true,
        alreadyImported: !!stored, activityType: stored?.activity_type || guess.activityType,
        typeSource: stored?.type_source || guess.typeSource };
    });
    return { ok: true, ...stats, items };
  }

  async function saveArchive(userId, csv, selectedIds, typeOverrides = []) {
    const { rows: candidates, stats } = validateArchive(csv);
    const valid = new Set(candidates.map(r => r.contentId));
    if (selectedIds !== null && (!Array.isArray(selectedIds) || selectedIds.length > LIMIT_ACTIVITIES ||
      selectedIds.some(id => !isContentId(id) || !id.startsWith('archive_strava_') || !valid.has(id)) ||
      new Set(selectedIds).size !== selectedIds.length))
      throw httpError('La selección de actividades no es válida.');
    if (!Array.isArray(typeOverrides) || typeOverrides.length > LIMIT_ACTIVITIES ||
      typeOverrides.some(x => !x || !isContentId(x.id) || !valid.has(x.id) || !isActivityType(x.activityType)) ||
      new Set(typeOverrides.map(x => x.id)).size !== typeOverrides.length)
      throw httpError('Las categorías de actividades no son válidas.');
    const chosen = selectedIds === null ? null : new Set(selectedIds);
    const overrides = new Map(typeOverrides.map(x => [x.id, x.activityType]));
    const existing = await rows(userId);
    const byId = new Map(existing.map(r => [r.content_id, r]));
    const pending = new Map();
    let added = 0, duplicates = 0;
    for (const r of candidates) {
      const stored = byId.get(r.contentId) || findEquivalentFit(existing, r);
      const selected = chosen === null ? 1 : Number(chosen.has(r.contentId));
      const forcedType = overrides.has(r.contentId) ? overrides.get(r.contentId) : null;
      if (stored) {
        // Preservar categoria y tipo confirmados; un ZIP repetido no borra decisiones previas.
        pending.set(stored.content_id, { ...stored, user_id: userId, attested_at: Date.now(), activity_name: r.name,
          use_for_prediction: selected,
          activity_type: forcedType ?? stored.activity_type ?? 'sin_clasificar',
          type_source: forcedType !== null ? 'manual' : (stored.type_source || 'unset') });
        duplicates++;
      } else {
        if (existing.length + added >= LIMIT_ACTIVITIES) throw httpError('Límite de actividades del Laboratorio IA alcanzado.', 413);
        const record = newRow(userId, r, selected, forcedType);
        pending.set(record.content_id, record);
        byId.set(record.content_id, record);
        added++;
      }
    }
    // Las escrituras se dividen en lotes; si Supabase falla puede haber un lote parcial:
    // el upsert es idempotente y repetir la importación permite completar los restantes.
    await dbService.upsertMlOwnedActivities([...pending.values()]);
    const updated = await rows(userId);
    return { ok: true, ...stats, added, duplicates, count: updated.length,
      selectedCount: updated.filter(boolSelected).length,
      notice: 'Las actividades excluidas siguen guardadas. No se almacenan GPS ni pulsaciones.' };
  }

  app.get('/api/ml/history-diagnostics', account, async (req, res) => {
    try {
      const [imported, saved] = await Promise.all([general(req.user.id), rows(req.user.id)]);
      const manual = analyzeManualHistory(imported);
      const rated = mergeManualRatingHistory(saved, imported);
      const bySport = Object.fromEntries(OWNED_SPORTS.map(sport => [sport, {
        manualFound: manual.report.bySport[sport].found,
        manualEligible: manual.report.bySport[sport].eligible,
        manualExcluded: manual.report.bySport[sport].invalid,
        labStored: saved.filter(r => r.sport === sport).length,
        ratingValid: makeOwnedRating(rated, sport).activities
      }]));
      res.json({ manualTotal: manual.report.total, manualUnrecognized: manual.report.unrecognized,
        labTotal: saved.length, bySport,
        explanation: 'Solo se cuentan archivos aportados manualmente, no actividades leídas de la API de Strava.' });
    } catch (e) { fail(res, e, 'ML diagnostics'); }
  });

  app.post('/api/ml/sync-imported', account, async (req, res) => {
    if (req.headers['x-ml-user-file-consent'] !== 'true')
      return res.status(400).json({ error: 'Autoriza reutilizar los archivos importados manualmente para IA.' });
    try {
      const { items, report } = analyzeManualHistory(await general(req.user.id));
      const existing = await rows(req.user.id);
      const byId = new Map(existing.map(r => [r.content_id, r]));
      const fresh = [];
      let duplicates = 0, skippedFitEquivalent = 0;
      for (const r of items) {
        if (byId.has(r.contentId)) { duplicates++; continue; }
        if (findEquivalentFit(existing, r)) { skippedFitEquivalent++; continue; }
        if (existing.length + fresh.length >= LIMIT_ACTIVITIES) throw httpError('El Laboratorio IA ya tiene el máximo de actividades.', 413);
        fresh.push(newRow(req.user.id, r, 0)); // Desmarcadas por defecto
        byId.set(r.contentId, fresh.at(-1));
      }
      if (fresh.length) await dbService.upsertMlOwnedActivities(fresh);
      const updated = await rows(req.user.id);
      res.json({ ok: true, added: fresh.length, duplicates, skippedFitEquivalent,
        count: updated.length, selectedCount: updated.filter(boolSelected).length, report,
        notice: 'Las nuevas actividades se añaden desmarcadas; las selecciones previas no cambian.' });
    } catch (e) { fail(res, e, 'ML manual sync'); }
  });

  app.get('/api/ml/owned-profile', account, async (req, res) => {
    try { const sport = validateSport(req.query.sport || 'Carrera'); res.json(summarizeOwnedRows(await rows(req.user.id), sport)); }
    catch (e) { fail(res, e, 'ML profile'); }
  });
  app.get('/api/ml/rating', account, async (req, res) => {
    try {
      const sport = validateSport(req.query.sport || 'Carrera');
      const [saved, imported] = await Promise.all([rows(req.user.id), general(req.user.id)]);
      res.json(makeOwnedRating(mergeManualRatingHistory(saved, imported), sport));
    } catch (e) { fail(res, e, 'ML rating'); }
  });
  app.get('/api/ml/owned-activities', account, async (req, res) => {
    try {
      const items = (await rows(req.user.id)).map(formatRow);
      res.json({ items, total: items.length, selected: items.filter(x => x.selected).length, limit: LIMIT_ACTIVITIES });
    } catch (e) { fail(res, e, 'ML activities'); }
  });
  app.post('/api/ml/owned-selection', account, express.text({ type: 'text/plain', limit: '80kb' }), async (req, res) => {
    try {
      const { ids, selected } = JSON.parse(req.body || '{}');
      if (!Array.isArray(ids) || !ids.length || ids.length > LIMIT_ACTIVITIES || typeof selected !== 'boolean' ||
        ids.some(id => !isContentId(id)) || new Set(ids).size !== ids.length)
        throw httpError('Selecciona IDs únicos y selected=true/false.');
      await dbService.updateMlOwnedSelection(req.user.id, ids, selected);
      const updated = await rows(req.user.id);
      res.json({ ok: true, changed: ids.length, selectedCount: updated.filter(boolSelected).length });
    } catch (e) { if (e instanceof SyntaxError) e.status = 400; fail(res, e, 'ML selection'); }
  });
  app.post('/api/ml/owned-types', account, express.text({ type: 'text/plain', limit: '80kb' }), async (req, res) => {
    try {
      const { ids, activityType } = JSON.parse(req.body || '{}');
      if (!Array.isArray(ids) || !ids.length || ids.length > LIMIT_ACTIVITIES || !isActivityType(activityType) ||
        ids.some(id => !isContentId(id)) || new Set(ids).size !== ids.length)
        throw httpError('Selecciona identificadores únicos y un tipo de actividad válido.');
      await dbService.updateMlOwnedTypes(req.user.id, ids, activityType);
      res.json({ ok: true, changed: ids.length, activityType });
    } catch (e) { if (e instanceof SyntaxError) e.status = 400; fail(res, e, 'ML types'); }
  });

  app.post('/api/ml/owned-fit', account, express.raw({ type: 'application/octet-stream', limit: '15mb' }), async (req, res) => {
    if (req.headers['x-ml-independent-consent'] !== 'true')
      return res.status(400).json({ error: 'Confirma que tienes derecho a analizar este FIT y autorizas su uso.' });
    const filename = typeof req.query.filename === 'string' ? req.query.filename.slice(0, 260) : '';
    if (!/\.fit(?:\.gz)?$/i.test(filename) || !Buffer.isBuffer(req.body) || req.body.length < 1 || req.body.length > MAX_FIT_UPLOAD_BYTES)
      return res.status(400).json({ error: 'Selecciona FIT/FIT.GZ de hasta 15 MB.' });
    try {
      const decoded = await decodeFitUpload(req.body, filename);
      const fit = validOwnedFit(decoded);
      const existing = await dbService.getMlOwnedActivityById(req.user.id, fit.contentId);
      if (existing) return res.json({ ok: true, alreadyImported: true, date: fit.date,
        distanceKm: +fit.distanceKm.toFixed(2), count: await dbService.countMlOwnedActivities(req.user.id) });
      if (await dbService.countMlOwnedActivities(req.user.id) >= LIMIT_ACTIVITIES)
        throw httpError('Límite de actividades guardadas alcanzado.', 413);
      const row = newRow(req.user.id, { ...fit, name: `${fit.sport} FIT · ${fit.date}` }, 1);
      await dbService.upsertMlOwnedActivity(row);
      res.json({ ok: true, alreadyImported: false, date: fit.date,
        distanceKm: +fit.distanceKm.toFixed(2), count: await dbService.countMlOwnedActivities(req.user.id) });
    } catch (e) { fail(res, e, 'ML FIT'); }
  });
  app.post('/api/ml/owned-strava-preview', account, express.text({ type: 'text/csv', limit: '24mb' }), async (req, res) => {
    if (req.headers['x-ml-user-file-consent'] !== 'true')
      return res.status(400).json({ error: 'Autoriza analizar este archivo para IA.' });
    try { res.json(await preview(req.user.id, req.body)); }
    catch (e) { if (!e.status && /csv|actividad|columna|strava|export/i.test(e.message)) e.status = 400; fail(res, e, 'ML preview'); }
  });
  app.post('/api/ml/owned-strava-archive', account, express.text({ type: 'text/csv', limit: '24mb' }), async (req, res) => {
    if (req.headers['x-ml-user-file-consent'] !== 'true')
      return res.status(400).json({ error: 'Autoriza analizar este archivo para IA.' });
    try { res.json(await saveArchive(req.user.id, req.body, null)); }
    catch (e) { if (!e.status && /csv|actividad|columna|strava|export/i.test(e.message)) e.status = 400; fail(res, e, 'ML archive'); }
  });
  app.post('/api/ml/owned-strava-archive-selection', account, express.text({ type: 'text/plain', limit: '32mb' }), async (req, res) => {
    if (req.headers['x-ml-user-file-consent'] !== 'true')
      return res.status(400).json({ error: 'Autoriza analizar este archivo para IA.' });
    try {
      if (typeof req.body !== 'string' || req.body.length > 32 * 1024 * 1024) throw httpError('Archivo demasiado grande.', 413);
      const data = JSON.parse(req.body);
      if (!data || typeof data.csv !== 'string' || !Array.isArray(data.selectedIds)) throw httpError('Selección inválida.');
      res.json(await saveArchive(req.user.id, data.csv, data.selectedIds, data.typeOverrides ?? []));
    } catch (e) { if (e instanceof SyntaxError) e.status = 400; fail(res, e, 'ML archive selected'); }
  });
  app.post('/api/ml/predict-owned', account, async (req, res) => {
    try {
      const sport = validateSport(req.body?.sport ?? 'Carrera');
      const chosen = (await rows(req.user.id)).filter(r => boolSelected(r) && r.sport === sport);
      const mode = req.body?.mode ?? 'rodaje';
      if (!['rodaje', 'competicion'].includes(mode)) throw httpError('Selecciona Rodaje o Competición.');
      if (mode === 'competicion') {
        if (sport !== 'Carrera') throw httpError('Competición solo disponible para Carrera.', 422);
        return res.json({ ...historicalCompetitionProjection(chosen, req.body?.route),
          selectedActivities: chosen.length, origin: ORIGIN });
      }
      if (sport !== 'Carrera') {
        return res.json({ ...projectComparableSessions(chosen, req.body?.route, sport),
          selectedActivities: chosen.length, origin: ORIGIN });
      }
      const history = chosen.map(r => ({ date: r.activity_date, distanceKm: r.distance_km,
        durationMinutes: r.duration_minutes, ascentM: r.ascent_m }));
      const result = predictionForIndependentHistory({ source: 'manual_user_file', explicitConsent: true,
        history, route: req.body?.route });
      res.json({ ...result, mode: 'rodaje', projectionKind: 'ml_training_v1',
        selectedActivities: chosen.length,
        historyLastDate: [...history].sort((a, b) => a.date.localeCompare(b.date)).at(-1)?.date || null,
        origin: ORIGIN,
        caveat: 'Estimación experimental de entrenamiento: no distingue rodaje, series y recuperación; no sirve para predecir marcas competitivas.' });
    } catch (e) { fail(res, e, 'ML predict'); }
  });
  app.delete('/api/ml/owned-history', account, async (req, res) => {
    try { res.json({ ok: true, removed: await dbService.deleteMlOwnedActivities(req.user.id) }); }
    catch (e) { fail(res, e, 'ML delete'); }
  });
}
