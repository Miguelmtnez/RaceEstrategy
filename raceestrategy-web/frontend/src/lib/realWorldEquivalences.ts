export interface RealWorldEquivalence {
  equivalence: string;
  detail: string;
}

export function getDistanceEquivalence(km: number): RealWorldEquivalence {
  if (km <= 0) {
    return {
      equivalence: 'En la línea de salida',
      detail: 'Da tus primeras zancadas o pedaladas para empezar el viaje.'
    };
  }
  if (km < 10) {
    const vueltasRetiro = (km / 4).toFixed(1);
    return {
      equivalence: `~${vueltasRetiro} vueltas al Parque del Retiro`,
      detail: `Equivale a rodear ${vueltasRetiro} veces el perímetro del gran parque madrileño (4 km).`
    };
  }
  if (km < 42) {
    const vecesDiagonal = (km / 11).toFixed(1);
    return {
      equivalence: `Cruzar la Av. Diagonal de Barcelona ${vecesDiagonal} veces`,
      detail: `La Avenida Diagonal mide aprox. 11 km de punta a punta.`
    };
  }
  if (km < 100) {
    const maratones = (km / 42.195).toFixed(1);
    return {
      equivalence: `~${maratones} Maratones oficiales`,
      detail: 'La distancia mítica de Filípides entre Maratón y Atenas (42,195 km).'
    };
  }
  if (km < 250) {
    const pct = Math.round((km / 220) * 100);
    return {
      equivalence: `Travesía de Costa a Costa en Mallorca (${pct}%)`,
      detail: 'La vuelta perimetral cicloturista clásica a la isla de Mallorca son ~220 km.'
    };
  }
  if (km < 600) {
    const pct = Math.round((km / 505) * 100);
    return {
      equivalence: `Madrid ➔ Valencia en línea recta (${pct}%)`,
      detail: 'La distancia por carretera entre el centro de la península y el Mediterráneo (360 km).'
    };
  }
  if (km < 1200) {
    const pct = Math.round((km / 1020) * 100);
    return {
      equivalence: `De Alicante a A Coruña (${pct}%)`,
      detail: 'Cruzar España en diagonal de extremo a extremo (aprox. 1.020 km por carretera).'
    };
  }
  if (km < 2500) {
    const vecesCamino = (km / 780).toFixed(1);
    return {
      equivalence: `~${vecesCamino} veces el Camino Francés a Santiago`,
      detail: 'Desde Roncesvalles hasta la Plaza del Obradoiro en Santiago de Compostela (~780 km).'
    };
  }
  if (km < 5000) {
    const tourFrancia = (km / 3400).toFixed(1);
    return {
      equivalence: `~${tourFrancia} ediciones del Tour de Francia`,
      detail: 'El Tour de Francia recorre habitualmente unos 3.400 km a lo largo de tres semanas.'
    };
  }
  if (km < 10000) {
    const pct = Math.round((km / 9289) * 100);
    return {
      equivalence: `La ruta del Ferrocarril Transiberiano (${pct}%)`,
      detail: 'De Moscú a Vladivostok recorriendo 9.289 km a través de dos continentes.'
    };
  }
  if (km < 40075) {
    const pct = ((km / 40075) * 100).toFixed(1);
    return {
      equivalence: `${pct}% de la circunferencia de la Tierra`,
      detail: 'Dar la vuelta entera al planeta por la línea del Ecuador (40.075 km).'
    };
  }
  const vueltasMundo = (km / 40075).toFixed(1);
  return {
    equivalence: `~${vueltasMundo} vueltas completas al mundo`,
    detail: 'Has recorrido el equivalente a rodear el planeta Tierra entero por el ecuador.'
  };
}

export function getTimeEquivalence(hours: number): RealWorldEquivalence {
  if (hours <= 0) {
    return {
      equivalence: 'El tiempo comienza ahora',
      detail: 'Cada minuto cuenta para sumar tu historia.'
    };
  }
  if (hours < 5) {
    const min = Math.round(hours * 60);
    return {
      equivalence: `Ver una película o concierto largo (${min} min)`,
      detail: 'El tiempo que dura una gran obra cinematográfica o una sesión de lectura inmersiva.'
    };
  }
  if (hours < 24) {
    const h = hours.toFixed(1);
    return {
      equivalence: `Volar de Madrid a Tokio sin escalas (${h} h)`,
      detail: 'Un vuelo intercontinental de punta a punta del globo suele rondar las 13-14 horas.'
    };
  }
  if (hours < 72) {
    const dias = (hours / 24).toFixed(1);
    return {
      equivalence: `Fermentar un pan de masa madre artesanal (~${dias} días)`,
      detail: 'El tiempo reposado y lento de fermentación en frío para lograr un pan perfecto.'
    };
  }
  if (hours < 180) {
    const dias = (hours / 24).toFixed(1);
    return {
      equivalence: `Viaje en velero atravesando el Mediterráneo (~${dias} días)`,
      detail: 'Navegar de Barcelona a las Islas Baleares y vuelta con vientos suaves.'
    };
  }
  if (hours < 500) {
    const dias = (hours / 24).toFixed(1);
    return {
      equivalence: `Germinación y primer brote de un bonsái (~${dias} días)`,
      detail: 'Lo que tarda una semilla de roble o pino en abrirse paso bajo tierra y ver la luz.'
    };
  }
  if (hours < 1200) {
    const meses = (hours / 730).toFixed(1);
    return {
      equivalence: `El tiempo de gestación de un lince ibérico (~${meses} meses)`,
      detail: 'Aproximadamente 65 días (1.560 h) en los que la naturaleza crea una nueva vida.'
    };
  }
  if (hours < 3000) {
    const meses = (hours / 730).toFixed(1);
    return {
      equivalence: `Maduración de un queso manchego curado artesano (~${meses} meses)`,
      detail: 'Meses de paciencia y cuidado diario en cueva natural para alcanzar su aroma único.'
    };
  }
  const anios = (hours / 8760).toFixed(1);
  return {
    equivalence: `Construcción y vuelo de una misión espacial (~${anios} años)`,
    detail: 'Miles de horas dedicadas de continuo esfuerzo y pasión deportiva.'
  };
}

export function getElevationEquivalence(meters: number): RealWorldEquivalence {
  if (meters <= 0) {
    return {
      equivalence: 'Nivel del mar',
      detail: 'Preparado en el valle para empezar a ascender cumbres.'
    };
  }
  if (meters < 300) {
    const torres = (meters / 55).toFixed(1);
    return {
      equivalence: `~${torres} veces la Torre de Pisa (55 m)`,
      detail: 'La famosa torre inclinada de la Toscana italiana.'
    };
  }
  if (meters < 800) {
    const eiffels = (meters / 330).toFixed(1);
    return {
      equivalence: `~${eiffels} Torres Eiffel de París (330 m)`,
      detail: 'El monumento de hierro más famoso del mundo de base a cúspide.'
    };
  }
  if (meters < 2000) {
    const burj = (meters / 828).toFixed(1);
    return {
      equivalence: `~${burj} rascacielos Burj Khalifa (828 m)`,
      detail: 'Subir por las escaleras el edificio más alto construido por la humanidad en Dubái.'
    };
  }
  if (meters < 3718) {
    const pct = Math.round((meters / 3718) * 100);
    return {
      equivalence: `Subir al Teide desde el nivel del mar (${pct}%)`,
      detail: 'El pico más alto de España situado en Tenerife (3.718 m).'
    };
  }
  if (meters < 8848) {
    const teides = (meters / 3718).toFixed(1);
    return {
      equivalence: `~${teides} ascensiones completas al Teide`,
      detail: 'Cada ascensión completa supone superar 3.718 metros de desnivel vertical.'
    };
  }
  if (meters < 18000) {
    const everests = (meters / 8848).toFixed(1);
    return {
      equivalence: `~${everests} veces la altura del Monte Everest (8.848 m)`,
      detail: 'El techo del mundo en la cordillera del Himalaya.'
    };
  }
  if (meters < 50000) {
    const everests = (meters / 8848).toFixed(1);
    return {
      equivalence: `~${everests} Everests coronados desde el mar`,
      detail: 'Has acumulado tanto desnivel como las expediciones de los catorce ochomiles.'
    };
  }
  const estrato = (meters / 10000).toFixed(1);
  return {
    equivalence: `~${estrato} veces la altitud de crucero de un avión comercial`,
    detail: 'Has escalado más allá de la estratosfera terrestre verticalmente (10.000 m).'
  };
}
