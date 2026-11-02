export type User = { id: number; name: string; email: string };
export type ImportStatus = { imported: boolean; count: number; updatedAt: string|null; skipped: number; noMovingTime: number };
export type ImportResult = {
  ok:boolean;count:number;skipped:number;noMovingTime:number;noMetrics:number;sourceRows:number;
  skippedByReason:{ invalidId:number; invalidDate:number; duplicateId:number };
  skippedExamples:{row:number;reason:'invalidId'|'invalidDate'|'duplicateId';name:string;date:string}[];
};
export type StravaStatus = { connected: boolean; athleteId: string | null; scopes: string | null };
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
