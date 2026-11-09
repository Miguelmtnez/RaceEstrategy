// Deportes compatibles con historiales proporcionados voluntariamente por el usuario.
// No se consulta la API de Strava para el Laboratorio IA.
export const OWNED_SPORTS = Object.freeze(['Carrera','Bicicleta','MTB','Senderismo']);
const normalize = x => String(x ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const names = new Map();
for(const [sport,aliases] of [
  ['Carrera',['Run','Running','TrailRun','TrailRunning','VirtualRun','Treadmill','TreadmillRun','Carrera','Correr','CarreraDeMontana','CarreraPorMontana','CarreraEnCinta','RunningVirtual','RunningIndoors','IndoorRun']],
  ['Bicicleta',['Ride','Cycling','Cycle','Bike','Biking','Bicicleta','RoadCycling','RoadBike','GravelRide','Gravel','BicicletaCarretera','Ciclismo','CiclismoCarretera','BiciCarretera','RoadRide']],
  ['MTB',['MountainBikeRide','MountainBiking','MountainBike','MTB','BicicletaDeMontana','Mountain Bike']],
  ['Senderismo',['Hike','Hiking','Senderismo','SenderismoMontana','Trekking','Walk','Walking','Caminata','Caminar','SenderismoDeMontana']]
]) for (const name of aliases) names.set(normalize(name),sport);
export const normalizeOwnedSport = value => names.get(normalize(value)) ?? null;
export const isOwnedSport = value => OWNED_SPORTS.includes(value);
export const SPORT_LIMITS = Object.freeze({
  Carrera: {minKm:0.5,maxKm:100,minSpeed:2,maxSpeed:30,maxAscPerKm:350},
  Bicicleta:{minKm:1,maxKm:400,minSpeed:2,maxSpeed:100,maxAscPerKm:350},
  MTB:{minKm:1,maxKm:250,minSpeed:2,maxSpeed:70,maxAscPerKm:500},
  Senderismo:{minKm:0.5,maxKm:100,minSpeed:0.5,maxSpeed:12,maxAscPerKm:650},
});
export function validOwnedSummary(sport,km,minutes,ascent) {
  const l=SPORT_LIMITS[sport];
  return !!l && [km,minutes,ascent].every(Number.isFinite) &&
    km>=l.minKm&&km<=l.maxKm&&minutes>=5&&minutes<=1440&&
    km*60/minutes>=l.minSpeed&&km*60/minutes<=l.maxSpeed&&
    ascent>=0&&ascent<=15000&&ascent/km<=l.maxAscPerKm;
}
