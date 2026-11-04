import { GoogleGenAI } from '@google/genai';

const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;

/**
 * Genera una recomendación de ruta usando Gemini basándose en las últimas 10 actividades
 * y los parámetros seleccionados por el deportista.
 */
export async function recommendRouteWithAI({ recentActivities = [], targetParams }) {
  if (!ai) {
    throw new Error('GEMINI_API_KEY no está configurada en el servidor.');
  }

  // 1. Extraemos las últimas 10 actividades y resumimos sus métricas
  const last10 = recentActivities.slice(0, 10);
  const activitiesSummary = last10.map((a, idx) => {
    const distKm = (a.distance / 1000).toFixed(1);
    const elev = Math.round(a.elevation_gain || a.total_elevation_gain || 0);
    const mins = Math.round((a.moving_time || 0) / 60);
    const sport = a.sport_type || a.type || 'Actividad';
    return `${idx + 1}. ${sport} - ${distKm} km, ${elev} m desnivel en ${mins} min (${a.name || 'Sin título'})`;
  }).join('\n');

  // 2. Construimos el prompt con la plantilla exacta solicitada
  const prompt = `Eres un director deportivo y entrenador experto en ciclismo y running de RaceEstrategy.
Tu objetivo es diseñar y recomendar una ruta óptima y motivadora adaptada al nivel del deportista.

HISTORIAL RECIENTE DEL DEPORTISTA (Últimas 10 actividades):
${activitiesSummary || 'No hay actividades recientes registradas; asume un nivel intermedio.'}

PARÁMETROS PARA LA NUEVA RUTA:
- Distancia objetivo: ${targetParams.targetDistance || 'No especificada'}
- Desnivel buscado: ${targetParams.targetElevation || 'No especificado'}
- Tipo de recorrido: ${targetParams.routeType || 'No especificado'}
- Punto de salida/llegada: ${targetParams.startLocation || 'No especificado'}

INSTRUCCIONES DE RESPUESTA:
Proporciona la recomendación estructurada en las siguientes secciones con formato Markdown claro:
1. 🗺️ **Propuesta de Ruta y Trazado**: Descripción del recorrido saliendo desde el punto indicado, pueblos/zonas de paso clave y por qué encaja con la distancia y tipo de terreno pedido.
2. ⛰️ **Perfil y Dificultad**: Estimación del desnivel, tramos de subida más exigentes o zonas llanas.
3. ⚡ **Estrategia de Ritmo / Esfuerzo**: Consejos de ritmo o vatios/pulsaciones basados en sus últimas actividades para no fundirse.
4. 💧 **Consejos de Seguridad y Avituallamiento**: Hidratación recomendada y puntos clave.

Sé preciso, motivador y realista según la geografía del punto de salida.`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.5-flash-lite',
    contents: prompt,
  });

  return response.text;
}