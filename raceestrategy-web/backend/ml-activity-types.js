// Etiquetado EXPLÍCITO de actividades del historial manual. Esto NO es un clasificador ML.
// Los nombres de ZIP solo generan sugerencias. Una marca de competición debe confirmarla la persona.
export const ACTIVITY_TYPES = Object.freeze([
  'sin_clasificar', 'competicion', 'rodaje', 'series', 'tempo', 'recuperacion',
]);
const VALID = new Set(ACTIVITY_TYPES);
export const isActivityType = value => typeof value === 'string' && VALID.has(value);

export function suggestActivityType(name) {
  const normalized = String(name ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  // Nunca sugerir una competición sin confirmación manual, ni inferir tipo según velocidad.
  if (/\b(series?|interval(?:os?|s)?|intervals?|repeticiones?|reps?|fartlek|fraccionad[oa]s?|pista)\b/.test(normalized)) return 'series';
  if (/\b(calentamiento|calentar|warm\s?up|cool\s?down|enfriamiento|recuperacion|recovery|regenerativ[oa]|suave|trote|easy\s?run)\b/.test(normalized)) return 'recuperacion';
  if (/\b(tempo|umbral|threshold|progresiv[oa]|ritmo\s?controlado)\b/.test(normalized)) return 'tempo';
  if (/\b(rodaje|tirada|fondo|long\s?run|base|aerobic[oa])\b/.test(normalized)) return 'rodaje';
  return 'sin_clasificar';
}

export function defaultTypeForName(name) {
  const type = suggestActivityType(name);
  return {activityType:type, typeSource:type==='sin_clasificar'?'unset':'suggested'};
}
