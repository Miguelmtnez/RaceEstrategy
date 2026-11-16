export interface RealWorldEquivalence {
  equivalence: string;
  detail: string;
}

type GeneratorFn = (val: number) => RealWorldEquivalence;

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/* ==========================================
   DISTANCIA ACUMULADA (km)
========================================== */
export function getDistanceEquivalence(km: number): RealWorldEquivalence {
  if (km <= 0) {
    return {
      equivalence: 'En la línea de salida',
      detail: 'Da tus primeras zancadas o pedaladas para empezar el viaje.'
    };
  }

  const pool: GeneratorFn[] = [];

  // Menos de 15 km
  if (km < 15) {
    pool.push(
      (k) => ({
        equivalence: `~${(k / 4).toFixed(1)} vueltas al Parque del Retiro`,
        detail: 'Equivale a recorrer el perímetro del emblemático parque de Madrid (4 km).'
      }),
      (k) => ({
        equivalence: `~${(k / 11).toFixed(1)} veces la Av. Diagonal de Barcelona`,
        detail: 'La gran avenida que cruza la ciudad condal de extremo a extremo (~11 km).'
      }),
      (k) => ({
        equivalence: `~${(k / 5.5).toFixed(1)} veces cruzar Central Park de norte a sur`,
        detail: 'El pulmón de Nueva York mide 4 km de largo por casi 1 de ancho (perímetro ~9 km).'
      })
    );
  } else if (km < 100) {
    pool.push(
      (k) => ({
        equivalence: `~${(k / 42.195).toFixed(1)} Maratones oficiales`,
        detail: 'La distancia mítica de Filípides entre la ciudad de Maratón y Atenas (42,195 km).'
      }),
      (k) => ({
        equivalence: `Madrid a Toledo (${Math.round((k / 70) * 100)}%)`,
        detail: 'El viaje histórico uniendo la actual y la antigua capital castellana (~70 km).'
      }),
      (k) => ({
        equivalence: `Cruzar el Canal de la Mancha en su parte más estrecha ~${(k / 33).toFixed(1)} veces`,
        detail: 'El Estrecho de Dover mide aproximadamente 33 km de ancho.'
      }),
      (k) => ({
        equivalence: `~${(k / 21.097).toFixed(1)} Medias Maratones completadas`,
        detail: 'Cada media maratón supone 21,097 kilómetros de esfuerzo continuado.'
      })
    );
  } else if (km < 400) {
    pool.push(
      (k) => ({
        equivalence: `Travesía perimetral a Mallorca (${Math.round((k / 220) * 100)}%)`,
        detail: 'El reto cicloturista de dar la vuelta completa a la isla de Mallorca (~220 km).'
      }),
      (k) => ({
        equivalence: `Barcelona a Valencia por la costa (${Math.round((k / 350) * 100)}%)`,
        detail: 'Unir dos grandes capitales del Mediterráneo recorriendo 350 km de litoral.'
      }),
      (k) => ({
        equivalence: `Cruzar los Pirineos de costa a costa (${Math.round((k / 430) * 100)}%)`,
        detail: 'La travesía transpirenaica que une el mar Cantábrico con el mar Mediterráneo (~430 km).'
      })
    );
  } else if (km < 1200) {
    pool.push(
      (k) => ({
        equivalence: `De Alicante a A Coruña (${Math.round((k / 1020) * 100)}%)`,
        detail: 'Cruzar la Península Ibérica en diagonal de extremo a extremo (~1.020 km).'
      }),
      (k) => ({
        equivalence: `~${(k / 780).toFixed(1)} veces el Camino Francés a Santiago`,
        detail: 'Desde Roncesvalles hasta la Plaza del Obradoiro en Santiago de Compostela (~780 km).'
      }),
      (k) => ({
        equivalence: `Madrid a París (${Math.round((k / 1270) * 100)}%)`,
        detail: 'Unir la capital española con el corazón de Europa cruzando Francia.'
      }),
      (k) => ({
        equivalence: `Recorrer toda la mítica Ruta 66 en un ${Math.round((k / 3940) * 100)}%`,
        detail: 'The Mother Road: de Chicago a Santa Mónica atravesando Estados Unidos.'
      })
    );
  } else if (km < 5000) {
    pool.push(
      (k) => ({
        equivalence: `~${(k / 3400).toFixed(1)} ediciones del Tour de Francia`,
        detail: 'El Tour de Francia recorre unos 3.400 km a lo largo de 21 intensas etapas.'
      }),
      (k) => ({
        equivalence: `~${(k / 3200).toFixed(1)} Vueltas a España completas`,
        detail: 'La ronda española acumulando puertos de montaña y llanuras por toda la península (~3.200 km).'
      }),
      (k) => ({
        equivalence: `Cruzar el Océano Atlántico (${Math.round((k / 4800) * 100)}%)`,
        detail: 'La distancia marítima navegando entre la península y la costa de Norteamérica (~4.800 km).'
      }),
      (k) => ({
        equivalence: `~${(k / 780).toFixed(1)} Caminos de Santiago a pie`,
        detail: 'Decenas de jornadas recorriendo el norte de España hacia la catedral jacobea.'
      })
    );
  } else if (km < 20000) {
    pool.push(
      (k) => ({
        equivalence: `El ferrocarril Transiberiano (${Math.round((k / 9289) * 100)}%)`,
        detail: 'De Moscú al océano Pacífico en Vladivostok cruzando 8 zonas horarias y 9.289 km.'
      }),
      (k) => ({
        equivalence: `~${(k / 6400).toFixed(1)} veces la longitud del Río Amazonas`,
        detail: 'El río más largo y caudaloso del planeta Tierra (~6.400 km de longitud).'
      }),
      (k) => ({
        equivalence: `${((k / 40075) * 100).toFixed(1)}% de la vuelta al mundo`,
        detail: 'El perímetro ecuatorial completo de la Tierra (40.075 km).'
      })
    );
  } else {
    pool.push(
      (k) => ({
        equivalence: `~${(k / 40075).toFixed(1)} vueltas completas al planeta Tierra`,
        detail: 'Has recorrido más distancia que rodear la circunferencia del ecuador terrestre.'
      }),
      (k) => ({
        equivalence: `${((k / 384400) * 100).toFixed(1)}% de la distancia a la Luna`,
        detail: 'La distancia media de la Tierra a la Luna es de 384.400 km.'
      })
    );
  }

  return pickRandom(pool)(km);
}

/* ==========================================
   TIEMPO EN MOVIMIENTO (horas)
========================================== */
export function getTimeEquivalence(hours: number): RealWorldEquivalence {
  if (hours <= 0) {
    return {
      equivalence: 'El tiempo comienza ahora',
      detail: 'Cada minuto cuenta para sumar tu historia.'
    };
  }

  const pool: GeneratorFn[] = [];

  if (hours < 10) {
    pool.push(
      (h) => ({
        equivalence: `Ver una trilogía cinematográfica completa (${h.toFixed(1)} h)`,
        detail: 'Como ver las tres películas de El Señor de los Anillos en versión extendida (~11 h).'
      }),
      (h) => ({
        equivalence: `Una jornada de trabajo concentrado (${h.toFixed(1)} h)`,
        detail: 'Horas continuas de dedicación física activa.'
      }),
      (h) => ({
        equivalence: `Volar de Madrid a Nueva York (${Math.round((h / 8) * 100)}%)`,
        detail: 'Cruzar el océano Atlántico en avión dura aproximadamente 8 horas.'
      })
    );
  } else if (hours < 50) {
    pool.push(
      (h) => ({
        equivalence: `Volar de Madrid a Sídney o Tokio (~${h.toFixed(1)} h)`,
        detail: 'Las rutas aéreas más largas del planeta con escalas técnicas (~20-24 h).'
      }),
      (h) => ({
        equivalence: `Fermentar un pan de masa madre artesano (~${(h / 24).toFixed(1)} días)`,
        detail: 'El reposo lento de fermentación natural en frío para lograr un aroma perfecto.'
      }),
      (h) => ({
        equivalence: `Un fin de semana entero en movimiento ininterrumpido (~${(h / 24).toFixed(1)} días)`,
        detail: 'Dedicación absoluta acumulada minuto a minuto.'
      })
    );
  } else if (hours < 250) {
    pool.push(
      (h) => ({
        equivalence: `Cruzar el Atlántico en un velero rápido (~${(h / 24).toFixed(1)} días)`,
        detail: 'Una regata transatlántica a vela suele tardar entre 7 y 12 días continuos.'
      }),
      (h) => ({
        equivalence: `Completar el aprendizaje intensivo de un idioma (~${h.toFixed(0)} horas)`,
        detail: 'Las horas lectivas que estima el Instituto Cervantes para alcanzar un nivel intermedio (B1).'
      }),
      (h) => ({
        equivalence: `La metamorfosis completa de una oruga en mariposa (~${(h / 24).toFixed(1)} días)`,
        detail: 'El asombroso proceso biológico en el que la crisálida da paso a las alas.'
      })
    );
  } else if (hours < 1000) {
    pool.push(
      (h) => ({
        equivalence: `Germinación y crecimiento del primer tallo de un árbol (~${(h / 24).toFixed(0)} días)`,
        detail: 'Lo que tarda una semilla en la tierra en asentarse y alzar sus primeras ramas.'
      }),
      (h) => ({
        equivalence: `El viaje histórico de Magallanes cruzando el Pacífico (~${(h / 720).toFixed(1)} meses)`,
        detail: 'Tres meses y veinte días sin tocar tierra durante la primera vuelta al mundo.'
      }),
      (h) => ({
        equivalence: `Gestación de una nueva vida en la naturaleza (~${(h / 720).toFixed(1)} meses)`,
        detail: 'Meses de desarrollo biológico en animales de gran porte.'
      })
    );
  } else {
    pool.push(
      (h) => ({
        equivalence: `Maduración de un queso o vino de reserva (~${(h / 720).toFixed(1)} meses)`,
        detail: 'Meses y años de reposo y cuidado en barrica de roble o bodega subterránea.'
      }),
      (h) => ({
        equivalence: `Construcción y despegue de una expedición científica (~${(h / 8760).toFixed(1)} años)`,
        detail: 'Miles de horas de disciplina, constancia y superación personal acumuladas.'
      }),
      (h) => ({
        equivalence: `La órbita completa de Marte alrededor del Sol (${Math.round((h / 16488) * 100)}%)`,
        detail: 'El planeta rojo tarda 687 días terrestres en completar un año marciano.'
      })
    );
  }

  return pickRandom(pool)(hours);
}

/* ==========================================
   DESNIVEL POSITIVO (metros)
========================================== */
export function getElevationEquivalence(meters: number): RealWorldEquivalence {
  if (meters <= 0) {
    return {
      equivalence: 'Nivel del mar',
      detail: 'Preparado en el valle para empezar a ascender cumbres.'
    };
  }

  const pool: GeneratorFn[] = [];

  if (meters < 500) {
    pool.push(
      (m) => ({
        equivalence: `~${(m / 55).toFixed(1)} veces la Torre de Pisa (55 m)`,
        detail: 'La torre campanario más inclinada y famosa de Italia.'
      }),
      (m) => ({
        equivalence: `~${(m / 330).toFixed(1)} Torres Eiffel de París (330 m)`,
        detail: 'El icónico monumento parisino de hierro forjado de base a cúspide.'
      }),
      (m) => ({
        equivalence: `~${(m / 157).toFixed(1)} Torres de la Sagrada Familia (157 m)`,
        detail: 'La gran basílica de Antoni Gaudí en Barcelona.'
      })
    );
  } else if (meters < 2000) {
    pool.push(
      (m) => ({
        equivalence: `~${(m / 828).toFixed(1)} rascacielos Burj Khalifa (828 m)`,
        detail: 'El edificio más alto construido por el ser humano en Dubái.'
      }),
      (m) => ({
        equivalence: `~${(m / 330).toFixed(1)} Torres Eiffel escaladas consecutivamente`,
        detail: 'Superar 330 metros de desnivel vertical en cada ascenso.'
      }),
      (m) => ({
        equivalence: `Subir al Naranjo de Bulnes (Picu Urriellu) (${Math.round((m / 2519) * 100)}%)`,
        detail: 'El coloso de piedra caliza de los Picos de Europa (2.519 m de altitud).'
      })
    );
  } else if (meters < 5000) {
    pool.push(
      (m) => ({
        equivalence: `Subir al Teide desde el nivel del mar (${Math.round((m / 3718) * 100)}%)`,
        detail: 'El pico más alto de España y tercer volcán más grande del mundo en Tenerife (3.718 m).'
      }),
      (m) => ({
        equivalence: `~${(m / 3482).toFixed(1)} ascensiones al Mulhacén`,
        detail: 'El techo de la Península Ibérica en Sierra Nevada (3.482 m).'
      }),
      (m) => ({
        equivalence: `~${(m / 4809).toFixed(1)} cumbres del Mont Blanc`,
        detail: 'El techo de los Alpes y de Europa Occidental (4.809 m).'
      })
    );
  } else if (meters < 15000) {
    pool.push(
      (m) => ({
        equivalence: `~${(m / 8848).toFixed(1)} veces el Monte Everest (8.848 m)`,
        detail: 'El techo del mundo en la cordillera del Himalaya desde el nivel del mar.'
      }),
      (m) => ({
        equivalence: `~${(m / 3718).toFixed(1)} ascensiones completas al Teide`,
        detail: 'Superando 3.718 metros verticales de roca y ceniza volcánica en cada subida.'
      }),
      (m) => ({
        equivalence: `~${(m / 6961).toFixed(1)} veces el Aconcagua`,
        detail: 'El pico más alto de toda América y del hemisferio sur (6.961 m).'
      }),
      (m) => ({
        equivalence: `Alcanzar la altitud de crucero de un avión comercial (${Math.round((m / 10000) * 100)}%)`,
        detail: 'Los aviones comerciales vuelan habitualmente a unos 10.000 metros de altitud.'
      })
    );
  } else if (meters < 50000) {
    pool.push(
      (m) => ({
        equivalence: `~${(m / 8848).toFixed(1)} Everests coronados desde el mar`,
        detail: 'Has acumulado tanto desnivel como expediciones a los colosos del Himalaya.'
      }),
      (m) => ({
        equivalence: `~${(m / 4809).toFixed(1)} ascensiones al Mont Blanc`,
        detail: 'El gigante blanco de los Alpes superado una y otra vez.'
      }),
      (m) => ({
        equivalence: `Entrar en la Estratosfera terrestre ~${(m / 12000).toFixed(1)} veces`,
        detail: 'La tropopausa se sitúa entre los 10.000 y 12.000 metros de altitud vertical.'
      })
    );
  } else {
    pool.push(
      (m) => ({
        equivalence: `~${(m / 8848).toFixed(1)} veces el Monte Everest`,
        detail: 'Un desnivel acumulado equivalente a escalar docenas de veces la montaña más alta del planeta.'
      }),
      (m) => ({
        equivalence: `Llegar al límite de la atmósfera (Línea de Kármán: 100 km) al ${Math.round((m / 100000) * 100)}%`,
        detail: 'La frontera donde oficialmente comienza el espacio exterior (100.000 m de altitud).'
      })
    );
  }

  return pickRandom(pool)(meters);
}
