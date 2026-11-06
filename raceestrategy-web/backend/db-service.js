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
      elevation_gain: a.total_elevation_gain
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
    const { data, error } = await supabase
      .from('imported_activities')
      .select('activity_id, name, sport_type, start_date, distance, moving_time, elevation_gain')
      .eq('user_id', userId)
      .order('start_date', { ascending: false });
    if (error) throw error;

    return (data || []).map(r => ({
      id: r.activity_id,
      name: r.name,
      sport_type: r.sport_type,
      start_date: r.start_date,
      distance: r.distance,
      moving_time: r.moving_time,
      total_elevation_gain: r.elevation_gain
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
    await supabase.from('imported_activities').delete().eq('user_id', userId);
    await supabase.from('import_info').delete().eq('user_id', userId);
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

  // ML Owned Activities
  async getMlOwnedActivities(userId, limit = 2500) {
    const { data, error } = await supabase
      .from('ml_owned_activities')
      .select('content_id, activity_name, activity_date, sport, distance_km, duration_minutes, ascent_m, use_for_prediction')
      .eq('user_id', userId)
      .order('activity_date', { ascending: false })
      .order('content_id', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  },

  async countMlOwnedActivities(userId) {
    const { count, error } = await supabase
      .from('ml_owned_activities')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);
    if (error) throw error;
    return count || 0;
  },

  async getMlOwnedActivityById(userId, contentId) {
    const { data, error } = await supabase
      .from('ml_owned_activities')
      .select('content_id, activity_name, activity_date, sport, distance_km, duration_minutes, ascent_m, use_for_prediction')
      .eq('user_id', userId)
      .eq('content_id', contentId)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async findEquivalentFit(userId, date, distanceKm, durationMinutes) {
    const { data, error } = await supabase
      .from('ml_owned_activities')
      .select('content_id, activity_name, activity_date, sport, distance_km, duration_minutes, ascent_m, use_for_prediction')
      .eq('user_id', userId)
      .like('content_id', 'fit_%')
      .eq('activity_date', date)
      .gte('distance_km', distanceKm - 0.02)
      .lte('distance_km', distanceKm + 0.02)
      .gte('duration_minutes', durationMinutes - 0.25)
      .lte('duration_minutes', durationMinutes + 0.25)
      .limit(1)
      .maybeSingle();
    if (error) return null;
    return data;
  },

  async upsertMlOwnedActivity(row) {
    const { error } = await supabase
      .from('ml_owned_activities')
      .upsert(row, { onConflict: 'user_id,content_id' });
    if (error) throw error;
  },

  async updateMlOwnedSelection(userId, ids, selected) {
    const { error } = await supabase
      .from('ml_owned_activities')
      .update({ use_for_prediction: selected ? 1 : 0 })
      .eq('user_id', userId)
      .in('content_id', ids);
    if (error) throw error;
  },

  async deleteMlOwnedActivities(userId) {
    const { data, error } = await supabase
      .from('ml_owned_activities')
      .delete()
      .eq('user_id', userId)
      .select('content_id');
    if (error) throw error;
    return (data || []).length;
  }
};
