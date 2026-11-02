// Funciones puras, comprobables con npm test. Los datos reales provienen de la API de Strava.
const MONTH_FORMAT = new Intl.DateTimeFormat('es-ES', { month: 'short' });

export function groupSport(activity) {
  const s = String(activity.sport_type || activity.type || '').trim();
  if (['Run', 'TrailRun', 'VirtualRun', 'Carrera', 'Trail Run', 'Virtual Run'].includes(s)) return 'Carrera';
  if (['Ride', 'VirtualRide', 'GravelRide', 'EBikeRide', 'EMountainBikeRide', 'MountainBikeRide', 'Handcycle', 'Velomobile', 'Bicicleta', 'Ciclismo', 'Mountain Bike', 'Gravel Ride', 'E-Bike Ride'].includes(s)) return 'Ciclismo';
  if (['Walk', 'Hike', 'Senderismo', 'Caminata'].includes(s)) return 'Senderismo';
  return 'Otros';
}

export function buildOverview(activities, athlete, now = new Date()) {
  const clean = activities.filter(a => Number.isFinite(a.distance) && Number.isFinite(a.moving_time));
  const distanceM = clean.reduce((s, a) => s + Math.max(0, a.distance), 0);
  const movingS = clean.reduce((s, a) => s + Math.max(0, a.moving_time), 0);
  const elevationM = clean.reduce((s, a) => s + Math.max(0, Number(a.total_elevation_gain) || 0), 0);
  const categories = ['Carrera', 'Ciclismo', 'Senderismo', 'Otros'];
  const bySport = categories.map(name => {
    const matching = clean.filter(a => groupSport(a) === name);
    return { name, count: matching.length, distanceKm: +(matching.reduce((sum, a) => sum + Math.max(0, a.distance), 0) / 1000).toFixed(1) };
  }).filter(x => x.count > 0);

  const monthly = Array.from({ length: 6 }, (_, i) => {
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (5 - i), 1));
    const next = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1));
    const matching = clean.filter(a => {
      const date = new Date(a.start_date || a.start_date_local);
      return Number.isFinite(date.getTime()) && date >= monthStart && date < next;
    });
    return {
      label: MONTH_FORMAT.format(monthStart).replace('.', ''),
      key: monthStart.toISOString().slice(0, 7),
      distanceKm: +(matching.reduce((s, a) => s + Math.max(0, a.distance), 0) / 1000).toFixed(1),
      activities: matching.length
    };
  });

  const recent = [...clean].sort((a,b) => new Date(b.start_date || b.start_date_local).getTime()-new Date(a.start_date || a.start_date_local).getTime()).slice(0, 8).map(a => ({
    id: String(a.id),
    name: String(a.name || 'Actividad sin nombre'),
    sport: groupSport(a),
    date: a.start_date_local || a.start_date,
    distanceKm: +((Number(a.distance) || 0) / 1000).toFixed(2),
    movingMinutes: Math.round((Number(a.moving_time) || 0) / 60),
    elevationM: Math.round(Number(a.total_elevation_gain) || 0),
    url: `https://www.strava.com/activities/${encodeURIComponent(String(a.id))}`
  }));
  return {
    athlete: {
      firstname: String(athlete?.firstname || ''),
      lastname: String(athlete?.lastname || ''),
      picture: athlete?.profile_medium || athlete?.profile || null,
      stravaId: athlete?.id
    },
    stats: {
      activities: clean.length,
      distanceKm: +(distanceM / 1000).toFixed(1),
      movingHours: +(movingS / 3600).toFixed(1),
      elevationM: Math.round(elevationM)
    },
    bySport,
    monthly,
    recent,
    limited: activities.length >= 200,
    sampleSize: activities.length
  };
}
