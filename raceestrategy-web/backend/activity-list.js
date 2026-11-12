import { groupSport } from './metrics.js';
import { sanitizeHeartSummary } from './strava-events.js';

const CATEGORIES = { Carrera:'running', Ciclismo:'cycling', Senderismo:'hiking', Otros:'other' };
const SORTS = new Set(['newest', 'oldest', 'distance', 'duration']);
export function toActivity(raw, source) {
  const sport = groupSport(raw);
  const distance = Number(raw.distance);
  const moving = Number(raw.moving_time);
  const elevation = Number(raw.total_elevation_gain);
  const dateText = raw.start_date_local || raw.start_date;
  const date = new Date(dateText);
  const km = Number.isFinite(distance) && distance > 0 ? distance / 1000 : null;
  const secs = Number.isFinite(moving) && moving > 0 ? moving : null;
  const elevationM = Number.isFinite(elevation) && elevation >= 0 ? elevation : null;
  return {
    id: String(raw.id), name: String(raw.name || 'Actividad sin nombre').slice(0, 200),
    date: Number.isFinite(date.getTime()) ? date.toISOString() : null,
    sport, category: CATEGORIES[sport], sportType: String(raw.sport_type || raw.type || 'Desconocido'),
    distanceKm: km === null ? null : Math.round(km * 100) / 100,
    movingSeconds: secs,
    elevationM: elevationM === null ? null : Math.round(elevationM),
    paceSecPerKm: sport === 'Carrera' && km && secs ? Math.round(secs / km) : null,
    speedKmH: sport === 'Ciclismo' && km && secs ? Math.round(km * 36000 / secs) / 10 : null,
    source,
    ...sanitizeHeartSummary(raw),
    url: /^\d{1,20}$/.test(String(raw.id)) ? `https://www.strava.com/activities/${raw.id}` : null
  };
}

export function listActivities(activities, query = {}) {
  const q = String(query.q || '').toLocaleLowerCase('es').trim().slice(0, 120);
  const sport = ['running','cycling','hiking','other'].includes(query.sport) ? query.sport : 'all';
  const sort = SORTS.has(query.sort) ? query.sort : 'newest';
  const from = /^\d{4}-\d{2}-\d{2}$/.test(query.from || '') ? query.from : '';
  const to = /^\d{4}-\d{2}-\d{2}$/.test(query.to || '') ? query.to : '';
  const pageSize = [10, 20, 50].includes(Number(query.pageSize)) ? Number(query.pageSize) : 10;
  const requestedPage = Math.max(1, Math.min(100000, Number.parseInt(query.page, 10) || 1));
  const filtered = activities.filter(a => {
    if (q && !`${a.name} ${a.sport} ${a.sportType}`.toLocaleLowerCase('es').includes(q)) return false;
    if (sport !== 'all' && a.category !== sport) return false;
    const day = a.date?.slice(0, 10) || '';
    if (from && day < from) return false;
    if (to && day > to) return false;
    return true;
  }).sort((a,b)=>{
    if (sort === 'distance') return (b.distanceKm ?? -1) - (a.distanceKm ?? -1) || (b.date || '').localeCompare(a.date || '');
    if (sort === 'duration') return (b.movingSeconds ?? -1) - (a.movingSeconds ?? -1) || (b.date || '').localeCompare(a.date || '');
    if (sort === 'oldest') return (a.date || '').localeCompare(b.date || '');
    return (b.date || '').localeCompare(a.date || '');
  });
  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, pages);
  const totals = filtered.reduce((acc,a)=>{
    if(a.distanceKm !== null) acc.distanceKm += a.distanceKm;
    if(a.movingSeconds !== null) acc.movingSeconds += a.movingSeconds;
    if(a.elevationM !== null) acc.elevationM += a.elevationM;
    return acc;
  },{ distanceKm: 0, movingSeconds: 0, elevationM: 0 });
  return { items: filtered.slice((page-1)*pageSize,page*pageSize), total, page, pageSize, pages,
    totals: { distanceKm: Math.round(totals.distanceKm*10)/10, movingHours: Math.round(totals.movingSeconds/360)/10, elevationM: Math.round(totals.elevationM) } };
}
