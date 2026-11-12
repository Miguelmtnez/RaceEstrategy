import { XMLParser } from 'fast-xml-parser';
import { decodeFitUpload } from './fit-import.js';

// Cálculo de distancia entre dos coordenadas GPS (Fórmula de Haversine) en metros
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Radio de la Tierra en metros
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// Extraer puntos y desniveles de un archivo GPX (XML)
export function parseGpxRoute(gpxString) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_'
  });

  const parsed = parser.parse(gpxString);
  const trk = parsed?.gpx?.trk;
  let trkpts = [];

  if (Array.isArray(trk)) {
    for (const t of trk) {
      const segs = Array.isArray(t.trkseg) ? t.trkseg : [t.trkseg];
      for (const seg of segs) {
        if (seg?.trkpt) {
          trkpts = trkpts.concat(Array.isArray(seg.trkpt) ? seg.trkpt : [seg.trkpt]);
        }
      }
    }
  } else if (trk?.trkseg) {
    const segs = Array.isArray(trk.trkseg) ? trk.trkseg : [trk.trkseg];
    for (const seg of segs) {
      if (seg?.trkpt) {
        trkpts = trkpts.concat(Array.isArray(seg.trkpt) ? seg.trkpt : [seg.trkpt]);
      }
    }
  } else if (parsed?.gpx?.rte?.rtept) {
    const pts = parsed.gpx.rte.rtept;
    trkpts = Array.isArray(pts) ? pts : [pts];
  }

  if (!trkpts || trkpts.length < 2) {
    throw new Error('El archivo GPX no contiene suficientes puntos de trazado GPS.');
  }

  let totalDistanceMeters = 0;
  let ascentMeters = 0;
  let descentMeters = 0;
  let minElevation = Infinity;
  let maxElevation = -Infinity;

  const points = [];

  for (let i = 0; i < trkpts.length; i++) {
    const pt = trkpts[i];
    const lat = Number(pt['@_lat']);
    const lon = Number(pt['@_lon']);
    const ele = pt.ele !== undefined ? Number(pt.ele) : null;

    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      points.push({ lat, lon, ele });

      if (ele !== null && Number.isFinite(ele)) {
        if (ele < minElevation) minElevation = ele;
        if (ele > maxElevation) maxElevation = ele;
      }

      if (i > 0) {
        const prev = points[points.length - 2];
        const dist = haversineDistance(prev.lat, prev.lon, lat, lon);
        totalDistanceMeters += dist;

        if (prev.ele !== null && ele !== null && Number.isFinite(prev.ele) && Number.isFinite(ele)) {
          const diff = ele - prev.ele;
          // Umbral de 0.5m para filtrar oscilaciones del sensor barométrico/GPS
          if (diff > 0.5) ascentMeters += diff;
          else if (diff < -0.5) descentMeters += Math.abs(diff);
        }
      }
    }
  }

  const distanceKm = Number((totalDistanceMeters / 1000).toFixed(2));
  const roundedAscent = Math.round(ascentMeters);
  const roundedDescent = Math.round(descentMeters);

  return {
    type: 'gpx',
    pointsCount: points.length,
    distanceKm,
    ascentM: roundedAscent,
    descentM: roundedDescent,
    minElevation: minElevation !== Infinity ? Math.round(minElevation) : null,
    maxElevation: maxElevation !== -Infinity ? Math.round(maxElevation) : null,
    startCoords: points[0] ? [points[0].lat, points[0].lon] : null,
    endCoords: points[points.length - 1] ? [points[points.length - 1].lat, points[points.length - 1].lon] : null
  };
}

// Extraer métricas de un archivo FIT
export async function parseFitRoute(buffer, fileName = 'ruta.fit') {
  const decoded = await decodeFitUpload(buffer, fileName);
  const distanceKm = Number(((decoded.distance || 0) / 1000).toFixed(2));
  const ascentM = decoded.total_elevation_gain !== null && Number.isFinite(decoded.total_elevation_gain)
    ? Math.round(decoded.total_elevation_gain)
    : 0;
  const descentM = ascentM; // Estimado para circuitos
  const durationMinutes = decoded.moving_time ? Number((decoded.moving_time / 60).toFixed(1)) : null;

  return {
    type: 'fit',
    name: decoded.name,
    date: decoded.date,
    sportType: decoded.sport_type,
    distanceKm,
    ascentM,
    descentM,
    durationMinutes,
    hasHeartRate: !!decoded.averageHeartRate,
    averageHeartRate: decoded.averageHeartRate
  };
}

// Analizar un enlace o texto de Google Maps (incluyendo URLs con waypoints de Explorar Rutas)
export function parseGoogleMapsUrl(urlString) {
  try {
    const cleanUrl = urlString.trim();
    const url = new URL(cleanUrl);
    let coords = [];

    // 1. Extraer origin, destination y waypoints de parámetros de búsqueda (https://www.google.com/maps/dir/?api=1&origin=...&destination=...&waypoints=...)
    const originParam = url.searchParams.get('origin');
    const destParam = url.searchParams.get('destination');
    const waypointsParam = url.searchParams.get('waypoints');

    const pointsList = [];
    if (originParam) pointsList.push(originParam);
    if (waypointsParam) {
      const parts = waypointsParam.split('|').filter(Boolean);
      pointsList.push(...parts);
    }
    if (destParam) pointsList.push(destParam);

    // Intentar extraer coordenadas numéricas directas de los puntos
    for (const pt of pointsList) {
      const coordMatch = pt.match(/(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
      if (coordMatch) {
        coords.push([Number(coordMatch[1]), Number(coordMatch[2])]);
      }
    }

    // 2. Extraer de formato en path (/dir/lat,lon/lat,lon o /dir/loc1/loc2/...)
    if (coords.length < 2) {
      const dirMatch = url.pathname.match(/dir\/([^/]+)\/([^/]+)/);
      const atMatch = url.pathname.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);

      if (dirMatch) {
        const p1 = dirMatch[1].split(',').map(Number);
        const p2 = dirMatch[2].split(',').map(Number);
        if (p1.length === 2 && Number.isFinite(p1[0]) && Number.isFinite(p1[1])) coords.push(p1);
        if (p2.length === 2 && Number.isFinite(p2[0]) && Number.isFinite(p2[1])) coords.push(p2);
      } else if (atMatch) {
        coords.push([Number(atMatch[1]), Number(atMatch[2])]);
      }
    }

    if (coords.length >= 2) {
      let cumulativeDist = 0;
      for (let i = 1; i < coords.length; i++) {
        cumulativeDist += haversineDistance(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1]);
      }
      // Si solo hay origen y destino en línea recta, se aplica un factor de sinuosidad de carreteras/caminos (1.3x)
      const windingFactor = coords.length > 2 ? 1.15 : 1.3;
      const estimatedKm = Number(((cumulativeDist * windingFactor) / 1000).toFixed(1));
      return {
        type: 'maps',
        valid: true,
        pointsCount: coords.length,
        startCoords: coords[0],
        endCoords: coords[coords.length - 1],
        estimatedDistanceKm: Math.max(1, estimatedKm),
        origin: originParam || null,
        destination: destParam || null,
        url: cleanUrl
      };
    }

    // Si los waypoints o paradas eran nombres de lugares (ej. Alicante, Mutxamel, Busot)
    return {
      type: 'maps',
      valid: true,
      url: cleanUrl,
      origin: originParam || null,
      destination: destParam || null,
      waypointsCount: pointsList.length,
      estimatedDistanceKm: pointsList.length >= 2 ? pointsList.length * 7.5 : null, // estimación promedio si hay paradas
      note: 'Ruta de Google Maps detectada. Se han vinculado sus waypoints.'
    };
  } catch {
    throw new Error('La URL de Google Maps no es válida o está incompleta.');
  }
}

// Función generadora de TIPS DE MEJORA para rebajar el tiempo
export function generateImprovementTips({ sport, distanceKm, ascentM, estimatedMinutes, previousMinutes = null, previousPace = null }) {
  const tips = [];
  const isCycling = sport === 'Bicicleta' || sport === 'MTB' || sport === 'Ciclismo';
  const paceMinKm = distanceKm > 0 ? estimatedMinutes / distanceKm : 0;
  const speedKmH = estimatedMinutes > 0 ? (distanceKm / estimatedMinutes) * 60 : 0;
  const performanceStr = isCycling
    ? `${speedKmH.toFixed(1)} km/h de media`
    : `${Math.floor(paceMinKm)}:${String(Math.round((paceMinKm % 1) * 60)).padStart(2, '0')} min/km`;

  const isHilly = ascentM > (distanceKm * 15); // >15m de desnivel por km se considera ondulado/montañoso
  const isLong = (sport === 'Carrera' && distanceKm >= 15) || (isCycling && distanceKm >= 60);

  // 1. Comparativa si la ruta ya se ha realizado previamente
  if (previousMinutes && previousMinutes > 0) {
    const diff = Number((previousMinutes - estimatedMinutes).toFixed(1));
    if (diff > 0) {
      tips.push({
        title: `Margen de mejora potencial: -${Math.round(diff)} minutos`,
        tag: 'Comparativa previa',
        desc: `Tu condición física actual proyecta que puedes rebajar tu registro anterior (${Math.round(previousMinutes)} min) a ${Math.round(estimatedMinutes)} min (${performanceStr}).`
      });
    } else {
      tips.push({
        title: `Gestión de ritmo respecto a tu récord anterior`,
        tag: isCycling ? 'Velocidad objetivo' : 'Objetivo de ritmo',
        desc: `Tu mejor marca en esta distancia es de ${Math.round(previousMinutes)} min. Para superarla, mantén un promedio constante de ${performanceStr} desde el inicio.`
      });
    }
  }

  // 2. Tips según altimetría y terreno
  if (isHilly) {
    tips.push({
      title: 'Estrategia de vatios / pulso en subidas',
      tag: 'Gestión de desniveles',
      desc: `La ruta acumula +${ascentM}m. Un error habitual es subir un 15% más rápido de lo debido y acumular ácido láctico. Modera el ritmo en las rampas pronunciadas para llegar con fuerza a los llanos.`
    });
    tips.push({
      title: 'Aprovechar las bajadas y llanos rápidos',
      tag: 'Técnica de descenso',
      desc: 'En las bajadas, relaja la zancada/cadencia y mantén el tronco estable para ganar segundos gratis sin disparar la frecuencia cardíaca.'
    });
  } else {
    tips.push({
      title: 'Pacing uniforme (Negative Split)',
      tag: 'Estrategia de ritmo',
      desc: 'El perfil es predominantemente llano. Intenta hacer la primera mitad 5-8 segundos/km más lenta que tu objetivo y acelera en el último tercio para lograr tu mejor marca.'
    });
  }

  // 3. Nutrición e hidratación
  if (isLong || estimatedMinutes >= 60) {
    tips.push({
      title: 'Plan de carbohidratos intra-entrenamiento',
      tag: 'Nutrición en carrera',
      desc: `Con una duración prevista de ${Math.round(estimatedMinutes)} min, la depleción de glucógeno te ralentizará a partir del km ${Math.round(distanceKm * 0.7)}. Consume entre 30g y 60g de hidratos por hora desde el minuto 40.`
    });
  }

  // 4. Cadencia óptima
  if (sport === 'Carrera') {
    tips.push({
      title: 'Optimización de cadencia (175 - 182 spm)',
      tag: 'Eficiencia mecánica',
      desc: 'Aumentar la cadencia de pasos acorta el tiempo de contacto con el suelo y reduce el frenado en cada apoyo, ahorrando hasta un 3% de energía metabólica.'
    });
  } else if (sport === 'Bicicleta' || sport === 'MTB') {
    tips.push({
      title: 'Cadencia de pedaleo fluida (85 - 95 RPM)',
      tag: 'Economía de pedaleo',
      desc: 'Rodar trancado con desarrollos duros agota las fibras rápidas musculares. Mantén una cadencia ligera y constante para retrasar la fatiga en las piernas.'
    });
  }

  return tips;
}
