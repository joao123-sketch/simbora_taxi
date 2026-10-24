import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { CenterPin } from './CenterPin';
import type { PinMapProps } from './PinMap.types';

// No celular o mapa é o mesmo Leaflet da versão web, dentro de um WebView.
// O Google Maps do Expo Go não desenha as ruas sem uma chave nossa, e assim
// o mapa funciona igual no Expo Go, no navegador e no app final.
const ZOOM = 16;
// OpenStreetMap serve para desenvolver; a política de uso deles não cobre um
// app em produção, então antes do lançamento trocamos por um provedor com
// chave (MapTiler, Stadia ou Google).
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

function mapHtml(lat: number, lng: number) {
  return `<!doctype html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>html, body, #map { margin: 0; height: 100%; }</style>
</head>
<body>
<div id="map"></div>
<script>
  var map = L.map('map', { zoomControl: false }).setView([${lat}, ${lng}], ${ZOOM});
  L.tileLayer('${TILE_URL}', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);
  map.on('moveend', function () {
    var c = map.getCenter();
    window.ReactNativeWebView.postMessage(JSON.stringify({ lat: c.lat, lng: c.lng }));
  });
</script>
</body>
</html>`;
}

export function PinMap({ center, onCenterChange }: PinMapProps) {
  const webRef = useRef<WebView>(null);
  const loaded = useRef(false);

  // O HTML é montado uma vez, com o primeiro centro; depois o mapa só é movido.
  const html = useMemo(() => mapHtml(center.lat, center.lng), []);

  useEffect(() => {
    if (!loaded.current) return;
    webRef.current?.injectJavaScript(`map.setView([${center.lat}, ${center.lng}]); true;`);
  }, [center.lat, center.lng]);

  function handleMessage(event: WebViewMessageEvent) {
    const { lat, lng } = JSON.parse(event.nativeEvent.data);
    onCenterChange({ lat, lng });
  }

  return (
    <View style={styles.container}>
      <WebView<object>
        ref={webRef}
        style={StyleSheet.absoluteFill}
        originWhitelist={['*']}
        // A baseUrl dá à página uma origem, que o OpenStreetMap exige (Referer).
        source={{ html, baseUrl: 'https://simbora.app/' }}
        onLoadEnd={() => {
          loaded.current = true;
          webRef.current?.injectJavaScript(`map.setView([${center.lat}, ${center.lng}]); true;`);
        }}
        onMessage={handleMessage}
        scrollEnabled={false}
        overScrollMode="never"
      />
      <CenterPin />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
