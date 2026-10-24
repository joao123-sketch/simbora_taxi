import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

import type { LiveMapProps } from './LiveMap.types';

// No celular o mapa é o mesmo Leaflet da versão web, dentro de um WebView. A
// página nasce uma vez; as posições novas entram por injectJavaScript.
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

function mapHtml(lat: number, lng: number) {
  return `<!doctype html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>html, body, #map { margin: 0; height: 100%; } .m { font-size: 30px; line-height: 30px; text-align: center; filter: drop-shadow(0 1px 2px rgba(0,0,0,.5)); }</style>
</head>
<body>
<div id="map"></div>
<script>
  var map = L.map('map', { zoomControl: false }).setView([${lat}, ${lng}], 16);
  L.tileLayer('${TILE_URL}', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);
  function icon(emoji) {
    return L.divIcon({ className: '', html: '<div class="m">' + emoji + '</div>', iconSize: [34, 34], iconAnchor: [17, 17] });
  }
  var target = L.marker([${lat}, ${lng}], { icon: icon('📍') }).addTo(map);
  var car = null, fitted = false;
  function update(tLat, tLng, dLat, dLng, emoji) {
    target.setLatLng([tLat, tLng]);
    if (dLat === null) return;
    if (!car) { car = L.marker([dLat, dLng], { icon: icon(emoji), zIndexOffset: 1000 }).addTo(map); }
    else { car.setLatLng([dLat, dLng]); }
    if (!fitted) { map.fitBounds([[tLat, tLng], [dLat, dLng]], { padding: [40, 40], maxZoom: 17 }); fitted = true; }
  }
</script>
</body>
</html>`;
}

export function LiveMap({ target, driver, vehicle }: LiveMapProps) {
  const webRef = useRef<WebView>(null);
  const loaded = useRef(false);
  // O HTML nasce uma vez, com o primeiro ponto.
  const html = useMemo(() => mapHtml(target.lat, target.lng), []);

  const push = () => {
    if (!loaded.current) return;
    const emoji = vehicle === 'moto' ? '🏍️' : '🚗';
    webRef.current?.injectJavaScript(
      `update(${target.lat}, ${target.lng}, ${driver ? driver.lat : 'null'}, ${driver ? driver.lng : 'null'}, '${emoji}'); true;`,
    );
  };

  useEffect(push, [target.lat, target.lng, driver?.lat, driver?.lng, vehicle]);

  return (
    <View style={styles.box}>
      <WebView<object>
        ref={webRef}
        style={StyleSheet.absoluteFill}
        originWhitelist={['*']}
        source={{ html, baseUrl: 'https://simbora.app/' }}
        onLoadEnd={() => {
          loaded.current = true;
          push();
        }}
        scrollEnabled={false}
        overScrollMode="never"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    height: 260,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#E8E8E8',
  },
});
