import { GoogleGenAI } from '@google/genai';

/**
 * Modelos disponibles probados para la clave activa
 */
const ACTIVE_MODELS = [
  'gemini-3.5-flash',
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash-lite'
];

/**
 * Genera una recomendación de ruta usando Gemini basándose en las últimas 10 actividades
 * y los parámetros seleccionados por el deportista.
 */
export async function recommendRouteWithAI({ recentActivities = [], targetParams }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY no está configurada en el servidor (revisa backend/.env).');
  }

  const ai = new GoogleGenAI({ apiKey });

  // 1. Extraemos las últimas 10 actividades y resumimos sus métricas
  const last10 = recentActivities.slice(0, 10);
  const activitiesSummary = last10.map((a, idx) => {
    // a puede ser formato crudo de BD o un objeto toActivity
    const rawDist = a.distance !== undefined ? a.distance : (a.distanceKm ? a.distanceKm * 1000 : 0);
    const distKm = a.distanceKm !== undefined && a.distanceKm !== null
      ? a.distanceKm.toFixed(1)
      : Number.isFinite(Number(rawDist)) && Number(rawDist) > 0
      ? (Number(rawDist) / 1000).toFixed(1)
      : null;

    const rawElev = a.elevationM !== undefined ? a.elevationM : (a.elevation_gain || a.total_elevation_gain || 0);
    const elev = Number.isFinite(Number(rawElev)) ? Math.round(Number(rawElev)) : null;

    const rawSecs = a.movingSeconds !== undefined ? a.movingSeconds : a.moving_time;
    const mins = Number.isFinite(Number(rawSecs)) && Number(rawSecs) > 0 ? Math.round(Number(rawSecs) / 60) : null;

    const sport = a.sport || a.sportType || a.sport_type || a.type || 'Actividad';

    if (!distKm && !mins) {
      return `${idx + 1}. ${sport} (${a.name || 'Sin título'})`;
    }
    return `${idx + 1}. ${sport} - ${distKm || '?'} km, ${elev !== null ? `${elev} m desnivel` : 'desnivel no reg.'} en ${mins || '?'} min (${a.name || 'Sin título'})`;
  }).join('\n');

  const travelMode = (targetParams.sport === 'Running' || targetParams.sport === 'Senderismo') ? 'walking' : 'bicycling';
  const start = targetParams.startLocation || 'No especificado';
  const end = targetParams.endLocation || start;

  const isHiking = targetParams.sport === 'Senderismo';
  const isRunning = targetParams.sport === 'Running';

  // Instrucciones específicas por deporte
  const sportInstructions = isHiking
    ? `4. ⚡ **Estrategia de Ritmo / Esfuerzo**: Ritmo estimado a pie/montaña (ej. 3.5 a 4.5 km/h en subidas, descansos cada hora), dosificación física.
5. 🧰 **Material y Seguridad en Montaña**: Calzado adecuado de senderismo/trekking, bastones, ropa térmica/cortavientos, agua mínima recomendada y botiquín básico.
6. 🌲 **Señalización y Entorno Natural**: Sendas homologadas (PR/GR/SL), puntos de agua o fuentes, cobertura y consejos medioambientales.`
    : isRunning
    ? `4. ⚡ **Estrategia de Ritmo / Esfuerzo**: Ritmo objetivo en min/km adaptado al desnivel y perfil.
5. 💧 **Consejos de Seguridad y Avituallamiento**: Hidratación recomendada y puntos clave.`
    : `4. ⚡ **Estrategia de Ritmo / Esfuerzo**: Consejos de ritmo (km/h o vatios) basados en sus actividades.
5. 💧 **Consejos de Seguridad y Avituallamiento**: Hidratación recomendada y puntos clave.`;

  const sportContext = isHiking
    ? 'guía de montaña, senderismo y trekking (excursionismo a pie)'
    : isRunning
    ? 'entrenador de atletismo y running de fondo'
    : 'entrenador de ciclismo de ruta y montaña';

  // 2. Construimos el prompt con reglas estrictas
  const prompt = `Actúa como ${sportContext} en RaceEstrategy.
El usuario ha seleccionado explícitamente la disciplina: **${targetParams.sport}**.

¡ATENCIÓN OBLIGATORIA!:
${isHiking ? '- Esta es una ruta EXCLUSIVA DE SENDERISMO / MONTAÑA A PIE (TREKKING / HIKING). NO es una ruta en bicicleta ni cicloturista bajo ningún concepto. Habla siempre de caminar, sendas, pistas forestales, cumbres y caminos peatonales.' : ''}
${isRunning ? '- Esta es una ruta de RUNNING / CARRERA A PIE. NO es de ciclismo.' : ''}

HISTORIAL RECIENTE DEL DEPORTISTA:
${activitiesSummary || 'No hay actividades recientes registradas; asume un nivel intermedio.'}

PARÁMETROS SELECCIONADOS POR EL USUARIO:
- Disciplina: ${targetParams.sport}
- Distancia objetivo: ${targetParams.targetDistance || 'No especificada'}
- Desnivel positivo: ${targetParams.targetElevation || 'No especificado'}
- Dificultad / Tipo: ${targetParams.routeType || 'No especificado'}
- Punto de salida: ${start}
- Punto de llegada: ${end}

INSTRUCCIONES DE RESPUESTA (Formato Markdown):
1. 🗺️ **Propuesta de Ruta (${targetParams.sport})**:
   - Nombre de la ruta o sendero y descripción paso a paso a pie saliendo de "${start}" y llegando a "${end}".
   - Nombres de senderos, PR, GR, caminos de herradura, collados o pistas forestales.
2. 📍 **Recorrido en Google Maps con Waypoints Obligatorios**:
   - Para que Google Maps no trace una línea recta de 100 metros o una simple calle entre origen y destino, DEBES OBLIGATORIAMENTE incluir entre 3 y 5 waypoints/puntos de paso intermedios reales de la ruta que pasen por los pueblos, montañas o cruces descritos arriba.
   - Formato oficial estricto:
     https://www.google.com/maps/dir/?api=1&origin=[Origen]&destination=[Destino]&waypoints=[PuntoPaso1]%7C[PuntoPaso2]%7C[PuntoPaso3]&travelmode=${travelMode}
   - Sustituye los espacios por + o %20 y separa cada waypoint con la barra vertical codificada (%7C).
   - Ejemplo para una ruta Alicante -> Mutxamel -> Busot -> Campello -> Alicante:
     👉 [Abrir recorrido completo en Google Maps](https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(start)}&destination=${encodeURIComponent(end)}&waypoints=Mutxamel%7CBusot%7CEl+Campello&travelmode=${travelMode})
   - Escribe el enlace real completo con los waypoints calculados para esta ruta específica. No pongas solo origen y destino.
3. ⛰️ **Perfil, Terreno y Dificultad**:
   - Desnivel estimado, tipos de terreno (senda de tierra, pedregal, pista forestal, asfalto residual).
${sportInstructions}

Sé preciso con la toponimia y entorno montañoso real.`;

  let lastError = null;

  for (const model of ACTIVE_MODELS) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
      });
      if (response && response.text) {
        return response.text;
      }
    } catch (err) {
      console.warn(`[Gemini Fallback] El modelo ${model} falló o está saturado, probando alternativo...`);
      lastError = err;
      await new Promise(r => setTimeout(r, 600));
    }
  }

  throw lastError || new Error('No se pudo generar contenido con los modelos disponibles.');
}
