import { supabase } from './supabase.js';

export const dbService = {
  // Users
  async findUserByEmail(email) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async createUser(name, email, passwordHash) {
    const { data, error } = await supabase
      .from('users')
      .insert({
        name,
        email,
        password_hash: passwordHash,
        created_at: Date.now()
      })
      .select('id, name, email')
      .single();
    if (error) throw error;
    return data;
  },

  async deleteUser(userId) {
    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', userId);
    if (error) throw error;
  },

  // Sessions
  async createSession(tokenHash, userId, expiresAt) {
    const { error } = await supabase
      .from('sessions')
      .insert({ token_hash: tokenHash, user_id: userId, expires_at: expiresAt });
    if (error) throw error;
  },

  async getSessionUser(tokenHash, now) {
    const { data, error } = await supabase
      .from('sessions')
      .select('user_id, expires_at, users ( id, name, email )')
      .eq('token_hash', tokenHash)
      .gt('expires_at', now)
      .maybeSingle();
    if (error) throw error;
    if (!data || !data.users) return null;
    return data.users;
  },

  async deleteSession(tokenHash) {
    const { error } = await supabase
      .from('sessions')
      .delete()
      .eq('token_hash', tokenHash);
    if (error) throw error;
  },

  async purgeExpiredSessions(now) {
    await supabase.from('sessions').delete().lt('expires_at', now);
    await supabase.from('oauth_states').delete().lt('expires_at', now);
  },

  // OAuth States
  async createOAuthState(stateHash, userId, sessionHash, expiresAt) {
    const { error } = await supabase
      .from('oauth_states')
      .insert({ state_hash: stateHash, user_id: userId, session_hash: sessionHash, expires_at: expiresAt });
    if (error) throw error;
  },

  async consumeOAuthState(stateHash) {
    const { data, error } = await supabase
      .from('oauth_states')
      .select('*')
      .eq('state_hash', stateHash)
      .maybeSingle();
    if (error) throw error;
    if (data) {
      await supabase.from('oauth_states').delete().eq('state_hash', stateHash);
    }
    return data;
  },

  // Strava Connections
  async getStravaConnectionByAthlete(athleteId) {
    const { data, error } = await supabase
      .from('strava_connections')
      .select('*')
      .eq('athlete_id', athleteId)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async getStravaConnectionByUser(userId) {
    const { data, error } = await supabase
      .from('strava_connections')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async upsertStravaConnection(userId, athleteId, scopes, accessToken, refreshToken, expiresAt) {
    const { error } = await supabase
      .from('strava_connections')
      .upsert({
        user_id: userId,
        athlete_id: athleteId,
        scopes,
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: expiresAt
      }, { onConflict: 'user_id' });
    if (error) throw error;
  },

  async updateStravaTokens(userId, accessToken, refreshToken, expiresAt) {
    const { error } = await supabase
      .from('strava_connections')
      .update({
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: expiresAt
      })
      .eq('user_id', userId);
    if (error) throw error;
  },

  async deleteStravaConnection(userId) {
    const { error } = await supabase
      .from('strava_connections')
      .delete()
      .eq('user_id', userId);
    if (error) throw error;
  },

  async getStravaStatus(userId) {
    const { data: sc, error: scErr } = await supabase
      .from('strava_connections')
      .select('athlete_id, scopes')
      .eq('user_id', userId)
      .maybeSingle();
    if (scErr) throw scErr;
    if (!sc) return { connected: false, athleteId: null, scopes: null, lastEventAt: null };

    const { data: se } = await supabase
      .from('strava_events')
      .select('last_event_at')
      .eq('user_id', userId)
      .maybeSingle();

    return {
      connected: true,
      athleteId: sc.athlete_id,
      scopes: sc.scopes,
      lastEventAt: se?.last_event_at ? new Date(se.last_event_at).toISOString() : null
    };
  },

  // Strava Webhook Events
  async recordStravaEvent(userId, kind) {
    const now = Date.now();
    const { error } = await supabase
      .from('strava_events')
      .upsert({
        user_id: userId,
        last_event_at: now,
        last_event_kind: kind
      }, { onConflict: 'user_id' });
    if (error) throw error;
  },

  // Imported Activities
  async getImportStatus(userId) {
    const { count, error: cErr } = await supabase
      .from('imported_activities')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);
    if (cErr) throw cErr;

    const { data: info, error: iErr } = await supabase
      .from('import_info')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (iErr) throw iErr;

    return {
      imported: (count || 0) > 0,
      count: count || 0,
      updatedAt: info?.updated_at ? new Date(info.updated_at).toISOString() : null,
      skipped: info?.skipped || 0,
      noMovingTime: info?.no_moving_time || 0
    };
  },

  async replaceImportedActivities(userId, activities, skipped, noMovingTime) {
    // 1. Borrar actividades anteriores
    await supabase.from('imported_activities').delete().eq('user_id', userId);

    // 2. Insertar en lotes de hasta 200
    const records = activities.map(a => ({
      user_id: userId,
      activity_id: String(a.id),
      name: a.name,
      sport_type: a.sport_type,
      start_date: a.start_date,
      distance: a.distance,
      moving_time: a.moving_time,
      elevation_gain: a.total_elevation_gain,
      average_heartrate: a.average_heartrate ?? null,
      max_heartrate: a.max_heartrate ?? null
    }));

    const BATCH = 200;
    for (let i = 0; i < records.length; i += BATCH) {
      const slice = records.slice(i, i + BATCH);
      const { error } = await supabase.from('imported_activities').insert(slice);
      if (error) throw error;
    }

    // 3. Upsert import_info
    const { error: infoErr } = await supabase
      .from('import_info')
      .upsert({
        user_id: userId,
        updated_at: Date.now(),
        skipped,
        no_moving_time: noMovingTime
      }, { onConflict: 'user_id' });
    if (infoErr) throw infoErr;
  },

  async getImportedActivities(userId) {
    // Supabase tiene un máximo de filas por respuesta (por defecto 1000).
    // Recuperar todo el historial para que el Rating no pierda entrenamientos.
    const all = [];
    const PAGE = 500;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('imported_activities')
        .select('activity_id, name, sport_type, start_date, distance, moving_time, elevation_gain, average_heartrate, max_heartrate')
        .eq('user_id', userId)
        .order('start_date', { ascending: false })
        .order('activity_id', { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      all.push(...(data || []));
      if (!data || data.length < PAGE) break;
    }
    const hrById = await this.getImportedHeartRateSummaries(userId);
    return all.map(r => ({
      id: r.activity_id,
      activity_id: r.activity_id,
      name: r.name,
      sport_type: r.sport_type,
      start_date: r.start_date,
      distance: r.distance,
      moving_time: r.moving_time,
      elevation_gain: r.elevation_gain,
      total_elevation_gain: r.elevation_gain,
      average_heartrate: hrById.get(r.activity_id)?.average_bpm ?? r.average_heartrate,
      max_heartrate: hrById.get(r.activity_id)?.max_bpm ?? r.max_heartrate,
      has_heartrate: hrById.has(r.activity_id) || r.average_heartrate !== null || r.max_heartrate !== null
    }));
  },

  async getImportUpdatedAt(userId) {
    const { data } = await supabase
      .from('import_info')
      .select('updated_at')
      .eq('user_id', userId)
      .maybeSingle();
    return data?.updated_at || null;
  },

  async deleteImportedActivities(userId) {
    // Borrado explícito de series cardíacas al eliminar el historial importado.
    const {error:hrErr}=await supabase.from('imported_activity_heartrate').delete().eq('user_id',userId);
    if(hrErr)throw hrErr;
    const {error:actErr}=await supabase.from('imported_activities').delete().eq('user_id', userId);
    if(actErr)throw actErr;
    const {error:infoErr}=await supabase.from('import_info').delete().eq('user_id', userId);
    if(infoErr)throw infoErr;
  },

  // Frecuencia cardíaca procedente SOLO de archivos aportados manualmente.
  // Nunca leer ni persistir series de la API de Strava en esta tabla.
  async getImportedActivityById(userId, activityId) {
    const {data,error}=await supabase.from('imported_activities')
      .select('activity_id,start_date').eq('user_id',userId).eq('activity_id',activityId).maybeSingle();
    if(error)throw error;
    return data;
  },

  async getImportedHeartRateSummaries(userId) {
    const result=new Map(); const page=500;
    for(let offset=0;;offset+=page){
      const {data,error}=await supabase.from('imported_activity_heartrate')
        .select('activity_id,average_bpm,max_bpm').eq('user_id',userId)
        .order('activity_id',{ascending:true}).range(offset,offset+page-1);
      if(error)throw error;
      for(const row of data||[]) result.set(row.activity_id,row);
      if(!data||data.length<page)break;
    }
    return result;
  },

  async getImportedHeartRateIds(userId) {
    return [...(await this.getImportedHeartRateSummaries(userId)).keys()];
  },

  async getImportedHeartRate(userId, activityId) {
    const {data,error}=await supabase.from('imported_activity_heartrate')
      .select('points').eq('user_id',userId).eq('activity_id',activityId).maybeSingle();
    if(error)throw error;
    return data;
  },

  async saveImportedHeartRate(userId, activityId, report) {
    const {error}=await supabase.from('imported_activity_heartrate').upsert({
      user_id:userId,activity_id:activityId,average_bpm:report.averageHeartRate,
      max_bpm:report.maxHeartRate,points:report.points,source_format:report.format,updated_at:Date.now()
    },{onConflict:'user_id,activity_id'});
    if(error)throw error;
  },

  // Saved Routes
  async getSavedRoutes(userId) {
    const { data, error } = await supabase
      .from('saved_routes')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async saveRoute(userId, fields) {
    const { data, error } = await supabase
      .from('saved_routes')
      .insert({
        user_id: userId,
        title: fields.title,
        sport: fields.sport,
        distance: fields.distance,
        elevation: fields.elevation,
        route_type: fields.routeType,
        start_location: fields.startLocation,
        end_location: fields.endLocation,
        maps_url: fields.mapsUrl,
        recommendation: fields.recommendation,
        created_at: Date.now()
      })
      .select('id')
      .single();
    if (error) throw error;
    return data?.id;
  },

  async deleteSavedRoute(id, userId) {
    const { data, error } = await supabase
      .from('saved_routes')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
      .select('id');
    if (error) throw error;
    return (data || []).length > 0;
  },

  // ML Owned Activities: historiales independientes de Strava API
  async getMlOwnedActivities(userId, limit = 2500) {
    const PAGE = 500;
    const cap = Math.max(0, Math.min(2500, Math.floor(Number(limit) || 0)));
    const output = [];
    for (let from = 0; from < cap; from += PAGE) {
      const len = Math.min(PAGE, cap - from);
      const { data, error } = await supabase
        .from('ml_owned_activities')
        .select('content_id,activity_name,activity_date,sport,distance_km,duration_minutes,ascent_m,use_for_prediction,activity_type,type_source')
        .eq('user_id', userId)
        .order('activity_date', { ascending: false })
        .order('content_id', { ascending: false })
        .range(from, from + len - 1);
      if (error) throw error;
      output.push(...(data || []));
      if (!data || data.length < len) break;
    }
    return output;
  },

  async countMlOwnedActivities(userId) {
    const { count, error } = await supabase
      .from('ml_owned_activities').select('*', { count: 'exact', head: true })
      .eq('user_id', userId);
    if (error) throw error;
    return count || 0;
  },

  async getMlOwnedActivityById(userId, contentId) {
    const { data, error } = await supabase
      .from('ml_owned_activities')
      .select('content_id,activity_name,activity_date,sport,distance_km,duration_minutes,ascent_m,use_for_prediction,activity_type,type_source')
      .eq('user_id', userId).eq('content_id', contentId).maybeSingle();
    if (error) throw error;
    return data;
  },

  async findEquivalentFit(userId, date, distanceKm, durationMinutes, sport = null) {
    let query = supabase.from('ml_owned_activities')
      .select('content_id,activity_name,activity_date,sport,distance_km,duration_minutes,ascent_m,use_for_prediction,activity_type,type_source')
      .eq('user_id', userId)
      .like('content_id', 'fit_%').eq('activity_date', date)
      .gte('distance_km', distanceKm - 0.02).lte('distance_km', distanceKm + 0.02)
      .gte('duration_minutes', durationMinutes - 0.25).lte('duration_minutes', durationMinutes + 0.25);
    if (sport) query = query.eq('sport', sport);
    const { data, error } = await query.limit(1).maybeSingle();
    if (error) throw error;
    return data;
  },

  async upsertMlOwnedActivity(row) {
    const { error } = await supabase.from('ml_owned_activities')
      .upsert(row, { onConflict: 'user_id,content_id' });
    if (error) throw error;
  },

  async upsertMlOwnedActivities(rows) {
    // Lotes para respetar límites de respuesta y reducir tiempo de importación.
    // Cada lote es idempotente, aunque el conjunto de lotes no es una transacción SQL única.
    for (let i = 0; i < rows.length; i += 100) {
      const { error } = await supabase.from('ml_owned_activities')
        .upsert(rows.slice(i, i + 100), { onConflict: 'user_id,content_id' });
      if (error) throw error;
    }
  },

  async updateMlOwnedSelection(userId, ids, selected) {
    await this.assertMlOwnedIds(userId, ids);
    for (let i = 0; i < ids.length; i += 100) {
      const { error } = await supabase.from('ml_owned_activities')
        .update({ use_for_prediction: selected ? 1 : 0 })
        .eq('user_id', userId).in('content_id', ids.slice(i, i + 100));
      if (error) throw error;
    }
  },

  async updateMlOwnedTypes(userId, ids, activityType) {
    await this.assertMlOwnedIds(userId, ids);
    for (let i = 0; i < ids.length; i += 100) {
      const { error } = await supabase.from('ml_owned_activities')
        .update({ activity_type: activityType, type_source: 'manual' })
        .eq('user_id', userId).in('content_id', ids.slice(i, i + 100));
      if (error) throw error;
    }
  },

  async assertMlOwnedIds(userId, ids) {
    // Evitar devoluciones de éxito si el cliente envía IDs inexistentes o ajenos.
    for (let i = 0; i < ids.length; i += 100) {
      const batch = ids.slice(i, i + 100);
      const { data, error } = await supabase.from('ml_owned_activities')
        .select('content_id').eq('user_id', userId).in('content_id', batch);
      if (error) throw error;
      if ((data || []).length !== batch.length) {
        const e = new Error('Hay actividades que no pertenecen a tu historial.');
        e.status = 404;
        throw e;
      }
    }
  },

  async deleteMlOwnedActivities(userId) {
    // No devolver todas las filas eliminadas: PostgREST podría truncar su respuesta.
    const count = await this.countMlOwnedActivities(userId);
    const { error } = await supabase.from('ml_owned_activities')
      .delete().eq('user_id', userId);
    if (error) throw error;
    return count;
  }
};
