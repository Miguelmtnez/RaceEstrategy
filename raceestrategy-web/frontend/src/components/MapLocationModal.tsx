import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { X, Check, MapPin } from 'lucide-react';

// Fix para los iconos por defecto de Leaflet en Vite/Webpack
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

type Props = {
  title: string;
  initialCoords?: { lat: number; lng: number };
  onSelect: (locationText: string, coords: { lat: number; lng: number }) => void;
  onClose: () => void;
};

export function MapLocationModal({ title, initialCoords, onSelect, onClose }: Props) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const [selectedCoords, setSelectedCoords] = React.useState<{ lat: number; lng: number }>(
    initialCoords || { lat: 38.3452, lng: -0.481 } // Alicante centro por defecto
  );
  const [addressName, setAddressName] = React.useState<string>('Buscando calle...');
  const [loadingAddress, setLoadingAddress] = React.useState<boolean>(false);

  // Obtener nombre de la calle y ciudad sin coordenadas numéricas
  const fetchAddress = async (lat: number, lng: number) => {
    setLoadingAddress(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`
      );
      const data = await res.json();
      const addr = data.address || {};

      // Priorizar: Calle + número, Plaza, Avenida, Carretera o Camino
      const street = addr.road || addr.pedestrian || addr.footway || addr.path || addr.square || addr.neighbourhood;
      const houseNumber = addr.house_number ? ` ${addr.house_number}` : '';
      const locality = addr.city || addr.town || addr.village || addr.municipality || addr.suburb || '';

      let formattedStreet = '';
      if (street && locality) {
        formattedStreet = `${street}${houseNumber}, ${locality}`;
      } else if (street) {
        formattedStreet = `${street}${houseNumber}`;
      } else if (locality) {
        formattedStreet = locality;
      } else {
        formattedStreet = data.display_name?.split(',').slice(0, 2).join(',') || 'Calle seleccionada';
      }

      setAddressName(formattedStreet);
    } catch {
      setAddressName('Calle seleccionada');
    } finally {
      setLoadingAddress(false);
    }
  };

  useEffect(() => {
    if (!mapContainerRef.current) return;

    const startLat = selectedCoords.lat;
    const startLng = selectedCoords.lng;

    const map = L.map(mapContainerRef.current).setView([startLat, startLng], 14);
    mapInstanceRef.current = map;

    // Capa de OpenStreetMap
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    // Marcador interactivo
    const marker = L.marker([startLat, startLng], { draggable: true }).addTo(map);
    markerRef.current = marker;

    fetchAddress(startLat, startLng);

    // Evento al arrastrar el marcador
    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      setSelectedCoords({ lat: pos.lat, lng: pos.lng });
      fetchAddress(pos.lat, pos.lng);
    });

    // Evento al hacer clic en cualquier parte del mapa
    map.on('click', (e: L.LeafletMouseEvent) => {
      marker.setLatLng(e.latlng);
      setSelectedCoords({ lat: e.latlng.lat, lng: e.latlng.lng });
      fetchAddress(e.latlng.lat, e.latlng.lng);
    });

    // Asegurar redimensionado correcto de los tiles
    setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => {
      map.remove();
    };
  }, []);

  const handleConfirm = () => {
    onSelect(addressName, selectedCoords);
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(23, 44, 35, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '16px',
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '750px',
          overflow: 'hidden',
          boxShadow: '0 20px 45px rgba(0,0,0,0.3)',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
        }}
      >
        {/* Cabecera */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#fafcfa',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <MapPin size={20} color="#27775f" />
            <h3 style={{ margin: 0, fontSize: '16px', color: '#1f5a46', fontWeight: 800 }}>
              {title}
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#64748b',
              padding: '4px',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Instrucciones */}
        <div style={{ padding: '10px 20px', background: '#f0fdf4', fontSize: '12px', color: '#166534', borderBottom: '1px solid #dcfce7' }}>
          💡 <strong>Haz clic en cualquier calle o plaza del mapa</strong> para seleccionarla automáticamente como punto de ruta.
        </div>

        {/* Contenedor del Mapa Leaflet */}
        <div
          ref={mapContainerRef}
          style={{
            width: '100%',
            height: '420px',
            background: '#f1f5f9',
          }}
        />

        {/* Pie con nombre de la calle identificada y botón de confirmación */}
        <div
          style={{
            padding: '16px 20px',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            background: '#fafcfa',
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <span style={{ fontSize: '11px', color: '#64748b', display: 'block', textTransform: 'uppercase', fontWeight: 700 }}>
              Calle / Lugar identificado:
            </span>
            <strong style={{ fontSize: '14px', color: '#1f5a46', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
              {loadingAddress ? 'Identificando calle...' : addressName}
            </strong>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '9px 16px',
                borderRadius: '9px',
                border: '1px solid #cbd5e1',
                background: '#fff',
                fontSize: '13px',
                fontWeight: 600,
                color: '#475569',
                cursor: 'pointer',
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="primary-btn"
              style={{
                padding: '9px 18px',
                borderRadius: '9px',
                fontSize: '13px',
                gap: '6px',
                cursor: 'pointer',
              }}
            >
              <Check size={16} /> Confirmar esta calle
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
