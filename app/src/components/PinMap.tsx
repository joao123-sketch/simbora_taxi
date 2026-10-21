import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView from 'react-native-maps';

import { CenterPin } from './CenterPin';
import type { PinMapProps } from './PinMap.types';

const DELTA = 0.008;

export function PinMap({ center, onCenterChange }: PinMapProps) {
  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    mapRef.current?.animateToRegion(
      { latitude: center.lat, longitude: center.lng, latitudeDelta: DELTA, longitudeDelta: DELTA },
      300,
    );
  }, [center.lat, center.lng]);

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={{
          latitude: center.lat,
          longitude: center.lng,
          latitudeDelta: DELTA,
          longitudeDelta: DELTA,
        }}
        showsUserLocation
        toolbarEnabled={false}
        onRegionChangeComplete={(region) =>
          onCenterChange({ lat: region.latitude, lng: region.longitude })
        }
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
