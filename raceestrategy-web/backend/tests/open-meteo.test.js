import test from 'node:test';
import assert from 'node:assert/strict';
import { extractRoutePoints, getRouteWeather } from '../open-meteo.js';

test('extracts the route origin, waypoints and destination from Gemini Maps links', () => {
  const recommendation = 'https://www.google.com/maps/dir/?api=1&origin=Alicante&destination=Busot&waypoints=Mutxamel%7CXixona';
  assert.deepEqual(extractRoutePoints(recommendation, 'Fallback'), ['Alicante', 'Mutxamel', 'Xixona', 'Busot']);
});

test('deduplicates route points and falls back to the requested start location', () => {
  assert.deepEqual(
    extractRoutePoints('https://www.google.com/maps/dir/?origin=Alicante&destination=Alicante', 'Fallback'),
    ['Alicante'],
  );
  assert.deepEqual(extractRoutePoints('No hay enlace de Maps', 'Alicante'), ['Alicante']);
});

test('aggregates the most adverse daily conditions across geocoded route points', async () => {
  const calls = [];
  const fetchImpl = async input => {
    const url = new URL(input);
    calls.push(url);

    if (url.hostname === 'geocoding-api.open-meteo.com') {
      const isMutxamel = url.searchParams.get('name') === 'Mutxamel';
      return {
        ok: true,
        json: async () => ({
          results: [{
            latitude: isMutxamel ? 38.4 : 38.3,
            longitude: isMutxamel ? -0.45 : -0.5,
            name: url.searchParams.get('name'),
          }],
        }),
      };
    }

    return {
      ok: true,
      json: async () => [0, 1].map((index) => ({
        latitude: index ? 38.4 : 38.3,
        longitude: index ? -0.45 : -0.5,
        daily: {
          time: Array.from({ length: 16 }, (_, day) => `2026-11-${String(12 + day).padStart(2, '0')}`),
          temperature_2m_min: Array.from({ length: 16 }, (_, day) => day < 2 ? (index ? [12, 10][day] : [9, 11][day]) : 10),
          temperature_2m_max: Array.from({ length: 16 }, (_, day) => day < 2 ? (index ? [20, 18][day] : [17, 21][day]) : 20),
          precipitation_probability_max: Array.from({ length: 16 }, (_, day) => day < 2 ? (index ? [40, 15][day] : [10, 70][day]) : 5),
          weather_code: Array.from({ length: 16 }, (_, day) => day < 2 ? (index ? [3, 61][day] : [1, 3][day]) : 0),
          wind_speed_10m_max: Array.from({ length: 16 }, (_, day) => day < 2 ? (index ? [25, 16][day] : [12, 30][day]) : 10),
        },
      })),
    };
  };

  const weather = await getRouteWeather({
    recommendation: 'https://www.google.com/maps/dir/?origin=Alicante&destination=Mutxamel',
    startLocation: 'Alicante',
    fetchImpl,
  });

  assert.equal(weather.forecastDays, 16);
  assert.equal(weather.daily.length, 16);
  assert.equal(weather.locations.length, 2);
  assert.deepEqual(weather.daily[0], {
    date: '2026-11-12',
    temperatureMin: 9,
    temperatureMax: 20,
    precipitationProbabilityMax: 40,
    windSpeedMax: 25,
    weatherCode: 3,
  });
  assert.equal(weather.daily[1].precipitationProbabilityMax, 70);
  assert.equal(weather.daily[1].weatherCode, 61);
  const forecastRequest = calls.find(url => url.hostname === 'api.open-meteo.com');
  assert.equal(forecastRequest.searchParams.get('forecast_days'), '16');
  assert.equal(forecastRequest.searchParams.get('latitude'), '38.3,38.4');
});

test('reports route points that could not be geocoded', async () => {
  const fetchImpl = async input => {
    const url = new URL(input);
    if (url.hostname === 'geocoding-api.open-meteo.com') {
      return { ok: true, json: async () => ({ results: null }) };
    }
    return { ok: true, json: async () => ({ daily: { time: [] } }) };
  };

  await assert.rejects(
    getRouteWeather({
      recommendation: 'https://www.google.com/maps/dir/?origin=Desconocido&destination=Desconocido',
      startLocation: 'Alicante',
      fetchImpl,
    }),
    /No se pudieron localizar/,
  );
});
