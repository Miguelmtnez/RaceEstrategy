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
    const distKm = (a.distance / 1000).toFixed(1);
    const elev = Math.round(a.elevation_gain || a.total_elevation_gain || 0);
    const mins = Math.round((a.moving_time || 0) / 60);
    const sport = a.sport_type || a.type || 'Actividad';
    return `${idx + 1}. ${sport} - ${distKm} km, ${elev} m desnivel en ${mins} min (${a.name || 'Sin título'})`;
  }).join('\n');

  const travelMode = targetParams.sport === 'Running' ? 'walking' : 'bicycling';
  const start = targetParams.startLocation || 'No especificado';
  const end = targetParams.endLocation || start;

  // 2. Construimos el prompt con la plantilla exacta solicitada + enlaces reales de Google Maps
  const prompt = `Eres un director deportivo y entrenador experto en ${targetParams.sport || 'ciclismo y running'} de RaceEstrategy.
Tu objetivo es diseñar y recomendar una ruta óptima y motivadora adaptada al nivel del deportista.

DISCIPLINA SELECCIONADA: ${targetParams.sport || 'Ciclismo'}

HISTORIAL RECIENTE DEL DEPORTISTA (Últimas 10 actividades):
${activitiesSummary || 'No hay actividades recientes registradas; asume un nivel intermedio.'}

PARÁMETROS PARA LA NUEVA RUTA:
- Deporte: ${targetParams.sport || 'Ciclismo'}
- Distancia objetivo: ${targetParams.targetDistance || 'No especificada'}
- Desnivel positivo buscado: ${targetParams.targetElevation || 'No especificado'}
- Tipo de recorrido: ${targetParams.routeType || 'No especificado'}
- Punto de salida: ${start}
- Punto de llegada: ${end}

INSTRUCCIONES DE RESPUESTA:
Proporciona la recomendación estructurada en las siguientes secciones con formato Markdown claro:
1. 🗺️ **Propuesta de Ruta y Trazado (${targetParams.sport})**: 
   - Descripción del recorrido saliendo desde "${start}" y finalizando en "${end}".
   - Indica pueblos/zonas de paso clave y por qué encaja con la distancia y tipo de terreno pedido.
2. 📍 **Recorrido en Google Maps**: 
   - Genera un enlace directo a Google Maps con la ruta real y puntos de paso utilizando el formato oficial:
     https://www.google.com/maps/dir/?api=1&origin=[Origen]&destination=[Destino]&waypoints=[Punto1]%7C[Punto2]%7C[Punto3]&travelmode=${travelMode}
     (Usa nombres reales separados por + sin espacios, con origin=${encodeURIComponent(start)} y destination=${encodeURIComponent(end)}).
   - Escribe el enlace así:
     👉 [Abrir recorrido completo en Google Maps](https://www.google.com/maps/dir/?api=1&...)
   - Lista los hitos y cruces ordenados del trayecto.
3. ⛰️ **Perfil y Dificultad**: Estimación del desnivel acumulado, tramos de subida más exigentes o zonas llanas.
4. ⚡ **Estrategia de Ritmo / Esfuerzo**: Consejos de ritmo (min/km si es Running, km/h o vatios si es Ciclismo) basados en sus últimas actividades para no fundirse.
5. 💧 **Consejos de Seguridad y Avituallamiento**: Hidratación recomendada y puntos clave.

Sé preciso, motivador y realista según la geografía de la zona.`;

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
