const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const MAX_ROUTE_POINTS = 7;

function isGoogleMapsDirectionsUrl(value) {
  try {
    const url = new URL(value);
    return url.hostname === 'www.google.com' && url.pathname.startsWith('/maps/dir/');
  } catch {
    return false;
  }
}

export function extractRoutePoints(recommendation, fallbackLocation) {
  const mapUrl = recommendation.match(/https?:\/\/www\.google\.com\/maps\/dir\/[^\s)]+/i)?.[0];
  const points = [];

  if (mapUrl && isGoogleMapsDirectionsUrl(mapUrl)) {
    const url = new URL(mapUrl);
    points.push(url.searchParams.get('origin'), ...((url.searchParams.get('waypoints') || '').split('|')), url.searchParams.get('destination'));
  }

  const uniquePoints = [...new Set(points
    .map(point => point?.trim())
    .filter(Boolean))].slice(0, MAX_ROUTE_POINTS);

  return uniquePoints.length ? uniquePoints : [fallbackLocation].filter(Boolean);
}

function parseCoordinates(location) {
  const match = location.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!match) return null;

  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

async function fetchJson(fetchImpl, url) {
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Open-Meteo respondió con HTTP ${response.status}.`);
  return response.json();
}

async function geocodeLocation(fetchImpl, location) {
  const coordinates = parseCoordinates(location);
  if (coordinates) return { ...coordinates, name: location };

  const url = new URL(GEOCODING_URL);
  url.searchParams.set('name', location);
  url.searchParams.set('count', '1');
  url.searchParams.set('language', 'es');
  url.searchParams.set('format', 'json');
  const data = await fetchJson(fetchImpl, url);
  const result = data.results?.[0];
  if (!result || !Number.isFinite(result.latitude) || !Number.isFinite(result.longitude)) return null;

  const qualifiers = [result.admin1, result.country].filter(Boolean);
  return {
    latitude: result.latitude,
    longitude: result.longitude,
    name: [result.name, ...qualifiers].join(', '),
  };
}

function weatherSeverity(code) {
  if (code >= 95) return 8;
  if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return 7;
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 6;
  if (code >= 51 && code <= 57) return 5;
  if (code === 45 || code === 48) return 4;
  if (code === 3) return 3;
  if (code === 2) return 2;
  if (code === 1) return 1;
  return 0;
}

function aggregateForecasts(forecasts, locations) {
  const dailyByDate = new Map();

  forecasts.forEach((forecast, index) => {
    const daily = forecast.daily;
    if (!daily?.time || !Array.isArray(daily.temperature_2m_min) || !Array.isArray(daily.temperature_2m_max)) {
      throw new Error('Open-Meteo devolvió un pronóstico diario incompleto.');
    }

    daily.time.forEach((date, dayIndex) => {
      const current = dailyByDate.get(date) || {
        date,
        temperatureMin: Infinity,
        temperatureMax: -Infinity,
        precipitationProbabilityMax: null,
        windSpeedMax: null,
        weatherCode: 0,
      };
      current.temperatureMin = Math.min(current.temperatureMin, daily.temperature_2m_min[dayIndex]);
      current.temperatureMax = Math.max(current.temperatureMax, daily.temperature_2m_max[dayIndex]);

      const precipitation = daily.precipitation_probability_max?.[dayIndex];
      if (Number.isFinite(precipitation)) {
        current.precipitationProbabilityMax = Math.max(current.precipitationProbabilityMax ?? 0, precipitation);
      }

      const windSpeed = daily.wind_speed_10m_max?.[dayIndex];
      if (Number.isFinite(windSpeed)) current.windSpeedMax = Math.max(current.windSpeedMax ?? 0, windSpeed);

      const weatherCode = daily.weather_code?.[dayIndex];
      if (Number.isFinite(weatherCode) && weatherSeverity(weatherCode) > weatherSeverity(current.weatherCode)) {
        current.weatherCode = weatherCode;
      }

      dailyByDate.set(date, current);
    });

    if (forecast.latitude !== undefined && forecast.longitude !== undefined) {
      locations[index].latitude = forecast.latitude;
      locations[index].longitude = forecast.longitude;
    }
  });

  const dailyForecast = [...dailyByDate.values()].map(day => ({
    ...day,
    temperatureMin: Number.isFinite(day.temperatureMin) ? day.temperatureMin : null,
    temperatureMax: Number.isFinite(day.temperatureMax) ? day.temperatureMax : null,
  }));
  if (dailyForecast.length !== 16) {
    throw new Error('Open-Meteo no devolvió los 16 días solicitados.');
  }
  return dailyForecast;
}

export async function getRouteWeather({ recommendation, startLocation, fetchImpl = fetch }) {
  const routePoints = extractRoutePoints(recommendation, startLocation);
  if (!routePoints.length) throw new Error('No hay ubicaciones disponibles para consultar el pronóstico.');

  const geocoded = await Promise.all(routePoints.map(location => geocodeLocation(fetchImpl, location)));
  const locations = geocoded
    .map((coordinates, index) => coordinates && { ...coordinates, routePoint: routePoints[index] })
    .filter(Boolean);
  const unresolvedLocations = routePoints.filter((_, index) => !geocoded[index]);

  if (!locations.length) throw new Error('No se pudieron localizar los puntos de la ruta para consultar el pronóstico.');

  const url = new URL(FORECAST_URL);
  url.searchParams.set('latitude', locations.map(location => location.latitude).join(','));
  url.searchParams.set('longitude', locations.map(location => location.longitude).join(','));
  url.searchParams.set('daily', 'temperature_2m_min,temperature_2m_max,precipitation_probability_max,weather_code,wind_speed_10m_max');
  url.searchParams.set('forecast_days', '16');
  url.searchParams.set('timezone', 'UTC');

  const forecastData = await fetchJson(fetchImpl, url);
  const forecasts = Array.isArray(forecastData) ? forecastData : [forecastData];
  if (forecasts.length !== locations.length) {
    throw new Error('Open-Meteo no devolvió datos para todos los puntos de la ruta.');
  }

  return {
    provider: 'Open-Meteo',
    forecastDays: 16,
    locations,
    unresolvedLocations,
    daily: aggregateForecasts(forecasts, locations),
  };
}
