export type User = { id: number; name: string; email: string };
export type ImportStatus = { imported: boolean; count: number; updatedAt: string|null; skipped: number; noMovingTime: number };
export type ImportResult = {
  ok:boolean;count:number;skipped:number;noMovingTime:number;noMetrics:number;sourceRows:number;
  skippedByReason:{ invalidId:number; invalidDate:number; duplicateId:number };
  skippedExamples:{row:number;reason:'invalidId'|'invalidDate'|'duplicateId';name:string;date:string}[];
};
export type StravaStatus = { connected: boolean; athleteId: string | null; scopes: string | null; lastEventAt?: string | null };
export type RecentActivity = {
  id: string; name: string; sport: string; date: string; distanceKm: number;
  movingMinutes: number; elevationM: number; url: string;
};
export type Overview = {
  athlete: { firstname: string; lastname: string; picture: string | null; stravaId?: number };
  stats: { activities: number; distanceKm: number; movingHours: number; elevationM: number };
  bySport: { name: string; count: number; distanceKm: number }[];
  monthly: { label: string; key: string; distanceKm: number; activities: number }[];
  recent: RecentActivity[]; limited: boolean; sampleSize: number;
  syncedAt: string; cached: boolean; source?: 'import' | 'api';
};

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers }
  });
  let data: unknown;
  try { data = await response.json(); } catch { throw new Error('La respuesta del servidor no es válida.'); }
  if (!response.ok) {
    const message = typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string'
      ? data.error : 'Ha ocurrido un error. Inténtalo otra vez.';
    throw new Error(message);
  }
  return data as T;
}

// Fase 2: historial completo importado o hasta las 200 actividades de la API actual.
export type ActivityItem = {
  id: string; name: string; date: string | null; sport: string; category: string;
  sportType: string; distanceKm: number | null; movingSeconds: number | null;
  elevationM: number | null; paceSecPerKm: number | null; speedKmH: number | null;
  source: 'api' | 'import'; url: string | null;
  hasHeartRate: boolean; averageHeartRate: number | null; maxHeartRate: number | null;
};
export type ActivityListing = {
  items: ActivityItem[]; total: number; page: number; pageSize: number; pages: number;
  totals: {distanceKm:number;movingHours:number;elevationM:number};
  source: 'api' | 'import'; limited:boolean;
};


// Fase 3: perfil estadístico (sin Machine Learning).
export type ProfileSport = 'all' | 'run' | 'cycle' | 'mtb' | 'hike' | 'other';
export type ProfileTotals = { activities: number; distanceKm: number; movingHours: number; elevationM: number; withDistance: number; withTime: number; missingDistance: number; missingTime: number };
export type ProfileBucket = ProfileTotals & { key: string; label: string };
export type SportProfile = {
  source: 'api' | 'import'; limited: boolean; sport: ProfileSport;
  summary: ProfileTotals;
  sportBreakdown: (ProfileTotals & {key: string; name: string})[];
  monthly: ProfileBucket[]; weekly: ProfileBucket[];
  comparison: { last30: ProfileTotals; previous30: ProfileTotals };
  consistency: { label: string; activities90d: number; weeks90d: number; description: string };
  insights: {
    longest: {id:string;name:string;date:string;distanceKm:number} | null;
    medianPaceSecPerKm: number|null; medianSpeedKmH: number|null;
    paceSamples: number; speedSamples: number;
  };
  coverage: {first:string|null;last:string|null};
};

export type HeartRateSeries = { available: boolean; points: {minute:number;bpm:number}[] };

export type RouteParams = {
  targetDistance: string;
  targetElevation: string;
  routeType: string;
  startLocation: string;
};

export type RouteRecommendationResponse = {
  ok: boolean;
  recommendation: string;
  usedActivitiesCount: number;
};

export async function getRouteRecommendation(params: RouteParams, source: 'import' | 'api' = 'import') {
  return api<RouteRecommendationResponse>(`/routes/recommend?source=${source}`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
}