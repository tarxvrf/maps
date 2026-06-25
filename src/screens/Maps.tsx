import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {WebView} from 'react-native-webview';
import Geolocation from 'react-native-geolocation-service';
import {PERMISSIONS, RESULTS, request} from 'react-native-permissions';
import {getDistance} from 'geolib';

import {searchPlace} from '../services/nominatim';
import {getHistory, saveHistory} from '../services/storage';

const MapWebView = WebView as any;

type Coordinate = {
  latitude: number;
  longitude: number;
};

type Place = Coordinate & {
  id: string;
  title: string;
  subtitle: string;
};

type SearchMode = 'pickup' | 'destination';

type ServiceOption = {
  id: string;
  name: string;
  description: string;
  baseFare: number;
  perKm: number;
  eta: number;
};

const DEFAULT_LOCATION: Coordinate = {
  latitude: -6.2088,
  longitude: 106.8456,
};

const SERVICE_OPTIONS: ServiceOption[] = [
  {
    id: 'instant',
    name: 'Instant',
    description: 'Driver terdekat, cocok untuk paket cepat',
    baseFare: 9000,
    perKm: 3300,
    eta: 18,
  },
  {
    id: 'hemat',
    name: 'Hemat',
    description: 'Lebih ekonomis untuk jarak dekat-menengah',
    baseFare: 6500,
    perKm: 2600,
    eta: 28,
  },
];

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value);

const formatDistance = (meters: number) => {
  if (meters < 1000) {
    return `${meters} m`;
  }

  return `${(meters / 1000).toFixed(1)} km`;
};

const makePlaceFromCurrentLocation = (coordinate: Coordinate): Place => ({
  ...coordinate,
  id: 'current-location',
  title: 'Lokasi saya saat ini',
  subtitle: `${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(
    5,
  )}`,
});

export default function Maps() {
  const webviewRef = useRef<any>(null);
  const watchIdRef = useRef<number | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [currentLocation, setCurrentLocation] =
    useState<Coordinate>(DEFAULT_LOCATION);
  const [pickup, setPickup] = useState<Place | null>(null);
  const [destination, setDestination] = useState<Place | null>(null);
  const [activeSearch, setActiveSearch] = useState<SearchMode>('destination');
  const [pickupQuery, setPickupQuery] = useState('');
  const [destinationQuery, setDestinationQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Place[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [packageNote, setPackageNote] = useState('');
  const [selectedServiceId, setSelectedServiceId] = useState('instant');

  const selectedService =
    SERVICE_OPTIONS.find(item => item.id === selectedServiceId) ||
    SERVICE_OPTIONS[0];

  const distance = useMemo(() => {
    if (!pickup || !destination) {
      return 0;
    }

    return getDistance(
      {latitude: pickup.latitude, longitude: pickup.longitude},
      {latitude: destination.latitude, longitude: destination.longitude},
    );
  }, [destination, pickup]);

  const fare = useMemo(() => {
    if (!distance) {
      return 0;
    }

    return Math.ceil(
      selectedService.baseFare + (distance / 1000) * selectedService.perKm,
    );
  }, [distance, selectedService]);

  const estimatedTime = useMemo(() => {
    if (!distance) {
      return selectedService.eta;
    }

    return Math.max(selectedService.eta, Math.round(distance / 420) + 8);
  }, [distance, selectedService]);

  const routePayload = useMemo(
    () => ({
      current: currentLocation,
      pickup,
      destination,
    }),
    [currentLocation, destination, pickup],
  );

  const html = useMemo(
    () => `
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
          <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
          <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
          <style>
            html, body, #map {
              height: 100%;
              width: 100%;
              margin: 0;
              padding: 0;
            }
            .pin {
              align-items: center;
              border-radius: 18px;
              color: white;
              display: flex;
              font-family: Arial, sans-serif;
              font-size: 12px;
              font-weight: 700;
              height: 36px;
              justify-content: center;
              width: 36px;
              box-shadow: 0 8px 18px rgba(0, 0, 0, 0.25);
            }
            .pin-current { background: #15803d; }
            .pin-pickup { background: #00aa5b; }
            .pin-destination { background: #111827; }
          </style>
        </head>
        <body>
          <div id="map"></div>
          <script>
            var map = L.map('map', { zoomControl: false }).setView([${DEFAULT_LOCATION.latitude}, ${DEFAULT_LOCATION.longitude}], 14);
            L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
              maxZoom: 19,
              attribution: 'OpenStreetMap'
            }).addTo(map);

            var currentMarker = null;
            var pickupMarker = null;
            var destinationMarker = null;
            var routeLine = null;

            function icon(className, label) {
              return L.divIcon({
                className: '',
                html: '<div class="pin ' + className + '">' + label + '</div>',
                iconSize: [36, 36],
                iconAnchor: [18, 18]
              });
            }

            function setMarker(existing, place, markerIcon, title) {
              if (!place) {
                if (existing) {
                  map.removeLayer(existing);
                }
                return null;
              }

              var latlng = [place.latitude, place.longitude];
              if (existing) {
                existing.setLatLng(latlng);
                return existing;
              }

              return L.marker(latlng, { icon: markerIcon, title: title }).addTo(map);
            }

            function updateMap(payload) {
              currentMarker = setMarker(currentMarker, payload.current, icon('pin-current', 'S'), 'Saya');
              pickupMarker = setMarker(pickupMarker, payload.pickup, icon('pin-pickup', 'J'), 'Jemput');
              destinationMarker = setMarker(destinationMarker, payload.destination, icon('pin-destination', 'T'), 'Tujuan');

              if (routeLine) {
                map.removeLayer(routeLine);
                routeLine = null;
              }

              var bounds = [];
              if (payload.current) bounds.push([payload.current.latitude, payload.current.longitude]);
              if (payload.pickup) bounds.push([payload.pickup.latitude, payload.pickup.longitude]);
              if (payload.destination) bounds.push([payload.destination.latitude, payload.destination.longitude]);

              if (payload.pickup && payload.destination) {
                routeLine = L.polyline([
                  [payload.pickup.latitude, payload.pickup.longitude],
                  [payload.destination.latitude, payload.destination.longitude]
                ], {
                  color: '#00aa5b',
                  weight: 5,
                  opacity: 0.85,
                  dashArray: '10, 8'
                }).addTo(map);
              }

              if (bounds.length > 1) {
                map.fitBounds(bounds, { padding: [54, 54], maxZoom: 15 });
              } else if (bounds.length === 1) {
                map.setView(bounds[0], 15);
              }
            }

            window.updateMap = updateMap;
          </script>
        </body>
      </html>
    `,
    [],
  );

  const requestPermission = async () => {
    const permission =
      Platform.OS === 'ios'
        ? PERMISSIONS.IOS.LOCATION_WHEN_IN_USE
        : PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION;
    const result = await request(permission);

    return result === RESULTS.GRANTED;
  };

  const loadHistory = useCallback(async () => {
    const items = await getHistory();
    setHistory(items);
  }, []);

  const startTracking = useCallback(() => {
    watchIdRef.current = Geolocation.watchPosition(
      position => {
        const coordinate = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };

        setCurrentLocation(coordinate);
        setPickup(currentPickup => currentPickup || makePlaceFromCurrentLocation(coordinate));
        setPickupQuery(currentQuery => currentQuery || 'Lokasi saya saat ini');
      },
      error => {
        console.log(error);
      },
      {
        enableHighAccuracy: true,
        distanceFilter: 5,
        interval: 3000,
        fastestInterval: 1500,
        forceRequestLocation: true,
      },
    );
  }, []);

  useEffect(() => {
    const init = async () => {
      const granted = await requestPermission();
      await loadHistory();

      if (granted) {
        startTracking();
      } else {
        setPickup(makePlaceFromCurrentLocation(DEFAULT_LOCATION));
        setPickupQuery('Monas, Jakarta Pusat');
      }
    };

    init();

    return () => {
      if (watchIdRef.current !== null) {
        Geolocation.clearWatch(watchIdRef.current);
      }
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
    };
  }, [loadHistory, startTracking]);

  useEffect(() => {
    webviewRef.current?.injectJavaScript(
      `window.updateMap(${JSON.stringify(routePayload)}); true;`,
    );
  }, [routePayload]);

  const runSearch = (keyword: string) => {
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }

    if (keyword.trim().length < 3) {
      setSuggestions([]);
      return;
    }

    searchTimerRef.current = setTimeout(async () => {
      try {
        setIsSearching(true);
        const results = await searchPlace(keyword);
        const places = results.map((item: any) => ({
          id: item.place_id?.toString() || `${item.lat}-${item.lon}`,
          title:
            item.name ||
            item.display_name?.split(',')[0] ||
            'Lokasi tanpa nama',
          subtitle: item.display_name,
          latitude: Number(item.lat),
          longitude: Number(item.lon),
        }));

        setSuggestions(places);
      } catch {
        Alert.alert('Pencarian gagal', 'Coba lagi beberapa saat lagi.');
      } finally {
        setIsSearching(false);
      }
    }, 450);
  };

  const setSearchText = (mode: SearchMode, value: string) => {
    setActiveSearch(mode);
    if (mode === 'pickup') {
      setPickupQuery(value);
    } else {
      setDestinationQuery(value);
    }
    runSearch(value);
  };

  const selectPlace = (place: Place, mode = activeSearch) => {
    if (mode === 'pickup') {
      setPickup(place);
      setPickupQuery(place.title);
    } else {
      setDestination(place);
      setDestinationQuery(place.title);
    }

    setSuggestions([]);
    Keyboard.dismiss();
  };

  const useCurrentAsPickup = () => {
    const place = makePlaceFromCurrentLocation(currentLocation);
    selectPlace(place, 'pickup');
  };

  const createOrder = async () => {
    if (!pickup || !destination) {
      Alert.alert('Lengkapi alamat', 'Pilih lokasi jemput dan tujuan dulu.');
      return;
    }

    const order = {
      id: `${Date.now()}`,
      pickup,
      destination,
      service: selectedService.name,
      packageNote,
      distance,
      fare,
      createdAt: new Date().toISOString(),
    };

    await saveHistory(order);
    await loadHistory();
    Alert.alert(
      'Order siap',
      `${selectedService.name} - ${formatDistance(distance)} - ${formatCurrency(
        fare,
      )}`,
    );
  };

  const renderSuggestion = ({item}: {item: Place}) => (
    <Pressable style={styles.suggestionItem} onPress={() => selectPlace(item)}>
      <View style={styles.placeIcon}>
        <Text style={styles.placeIconText}>
          {activeSearch === 'pickup' ? 'J' : 'T'}
        </Text>
      </View>
      <View style={styles.placeText}>
        <Text style={styles.placeTitle} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.placeSubtitle} numberOfLines={2}>
          {item.subtitle}
        </Text>
      </View>
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.container}>
      <MapWebView
        ref={webviewRef}
        originWhitelist={['*']}
        source={{html}}
        javaScriptEnabled
        domStorageEnabled
        onLoadEnd={() =>
          webviewRef.current?.injectJavaScript(
            `window.updateMap(${JSON.stringify(routePayload)}); true;`,
          )
        }
      />

      <View style={styles.topPanel}>
        <View style={styles.routeInputs}>
          <View style={styles.routeDots}>
            <View style={[styles.routeDot, styles.pickupDot]} />
            <View style={styles.routeLine} />
            <View style={[styles.routeDot, styles.destinationDot]} />
          </View>

          <View style={styles.inputGroup}>
            <TextInput
              value={pickupQuery}
              onFocus={() => setActiveSearch('pickup')}
              onChangeText={value => setSearchText('pickup', value)}
              placeholder="Alamat jemput"
              placeholderTextColor="#6b7280"
              style={[
                styles.input,
                activeSearch === 'pickup' && styles.inputActive,
              ]}
            />
            <TextInput
              value={destinationQuery}
              onFocus={() => setActiveSearch('destination')}
              onChangeText={value => setSearchText('destination', value)}
              placeholder="Kirim ke mana?"
              placeholderTextColor="#6b7280"
              style={[
                styles.input,
                activeSearch === 'destination' && styles.inputActive,
              ]}
            />
          </View>
        </View>

        <View style={styles.quickActions}>
          <Pressable style={styles.currentButton} onPress={useCurrentAsPickup}>
            <Text style={styles.currentButtonText}>Pakai lokasi saya</Text>
          </Pressable>
          {isSearching && <ActivityIndicator color="#00aa5b" size="small" />}
        </View>

        {suggestions.length > 0 && (
          <FlatList
            data={suggestions}
            keyExtractor={item => item.id}
            renderItem={renderSuggestion}
            style={styles.suggestions}
            keyboardShouldPersistTaps="handled"
          />
        )}
      </View>

      <View style={styles.bottomSheet}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.summaryRow}>
            <View>
              <Text style={styles.sheetEyebrow}>GoSend style</Text>
              <Text style={styles.sheetTitle}>Kirim barang</Text>
            </View>
            <View style={styles.priceBox}>
              <Text style={styles.priceLabel}>Estimasi</Text>
              <Text style={styles.priceText}>
                {fare ? formatCurrency(fare) : '-'}
              </Text>
            </View>
          </View>

          <View style={styles.metricsRow}>
            <View style={styles.metricItem}>
              <Text style={styles.metricValue}>
                {distance ? formatDistance(distance) : '-'}
              </Text>
              <Text style={styles.metricLabel}>Jarak</Text>
            </View>
            <View style={styles.metricItem}>
              <Text style={styles.metricValue}>{estimatedTime} menit</Text>
              <Text style={styles.metricLabel}>Tiba</Text>
            </View>
            <View style={styles.metricItem}>
              <Text style={styles.metricValue}>
                {destination ? 'Siap' : 'Cari'}
              </Text>
              <Text style={styles.metricLabel}>Status</Text>
            </View>
          </View>

          <View style={styles.serviceList}>
            {SERVICE_OPTIONS.map(item => {
              const active = item.id === selectedServiceId;
              return (
                <Pressable
                  key={item.id}
                  style={[styles.serviceCard, active && styles.serviceActive]}
                  onPress={() => setSelectedServiceId(item.id)}>
                  <View>
                    <Text style={styles.serviceName}>{item.name}</Text>
                    <Text style={styles.serviceDescription}>
                      {item.description}
                    </Text>
                  </View>
                  <Text style={styles.serviceFare}>
                    {distance
                      ? formatCurrency(
                          Math.ceil(item.baseFare + (distance / 1000) * item.perKm),
                        )
                      : 'Pilih tujuan'}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <TextInput
            value={packageNote}
            onChangeText={setPackageNote}
            placeholder="Catatan paket, contoh: makanan, dokumen, fragile"
            placeholderTextColor="#6b7280"
            style={styles.noteInput}
          />

          <Pressable style={styles.orderButton} onPress={createOrder}>
            <Text style={styles.orderButtonText}>Pesan pengiriman</Text>
          </Pressable>

          {history.length > 0 && (
            <View style={styles.historySection}>
              <Text style={styles.historyTitle}>Riwayat terakhir</Text>
              {history.slice(0, 3).map(item => (
                <Pressable
                  key={item.id}
                  style={styles.historyItem}
                  onPress={() => {
                    selectPlace(item.pickup, 'pickup');
                    selectPlace(item.destination, 'destination');
                    setSelectedServiceId(
                      SERVICE_OPTIONS.find(
                        service => service.name === item.service,
                      )?.id || 'instant',
                    );
                    setPackageNote(item.packageNote || '');
                  }}>
                  <Text style={styles.historyRoute} numberOfLines={1}>
                    {item.pickup.title} ke {item.destination.title}
                  </Text>
                  <Text style={styles.historyMeta}>
                    {item.service} - {formatDistance(item.distance)} -{' '}
                    {formatCurrency(item.fare)}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#eef2f1',
    flex: 1,
  },
  topPanel: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    left: 14,
    padding: 12,
    position: 'absolute',
    right: 14,
    shadowColor: '#000000',
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.14,
    shadowRadius: 18,
    top: Platform.OS === 'ios' ? 58 : 18,
  },
  routeInputs: {
    flexDirection: 'row',
    gap: 10,
  },
  routeDots: {
    alignItems: 'center',
    paddingTop: 15,
    width: 16,
  },
  routeDot: {
    borderRadius: 6,
    height: 12,
    width: 12,
  },
  pickupDot: {
    backgroundColor: '#00aa5b',
  },
  destinationDot: {
    backgroundColor: '#111827',
  },
  routeLine: {
    backgroundColor: '#d1d5db',
    flex: 1,
    marginVertical: 4,
    width: 2,
  },
  inputGroup: {
    flex: 1,
    gap: 8,
  },
  input: {
    backgroundColor: '#f3f4f6',
    borderColor: '#e5e7eb',
    borderRadius: 8,
    borderWidth: 1,
    color: '#111827',
    fontSize: 15,
    minHeight: 44,
    paddingHorizontal: 12,
  },
  inputActive: {
    borderColor: '#00aa5b',
  },
  quickActions: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  currentButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#e8f7ef',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  currentButtonText: {
    color: '#007a43',
    fontSize: 13,
    fontWeight: '700',
  },
  suggestions: {
    borderTopColor: '#eef2f1',
    borderTopWidth: 1,
    marginTop: 10,
    maxHeight: 230,
  },
  suggestionItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 10,
  },
  placeIcon: {
    alignItems: 'center',
    backgroundColor: '#e8f7ef',
    borderRadius: 8,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  placeIconText: {
    color: '#007a43',
    fontWeight: '800',
  },
  placeText: {
    flex: 1,
  },
  placeTitle: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '700',
  },
  placeSubtitle: {
    color: '#6b7280',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  bottomSheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    bottom: 0,
    left: 0,
    maxHeight: '48%',
    padding: 16,
    position: 'absolute',
    right: 0,
    shadowColor: '#000000',
    shadowOffset: {width: 0, height: -8},
    shadowOpacity: 0.12,
    shadowRadius: 18,
  },
  summaryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sheetEyebrow: {
    color: '#00aa5b',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  sheetTitle: {
    color: '#111827',
    fontSize: 22,
    fontWeight: '800',
    marginTop: 2,
  },
  priceBox: {
    alignItems: 'flex-end',
  },
  priceLabel: {
    color: '#6b7280',
    fontSize: 12,
  },
  priceText: {
    color: '#111827',
    fontSize: 17,
    fontWeight: '800',
  },
  metricsRow: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    flexDirection: 'row',
    marginTop: 14,
    padding: 10,
  },
  metricItem: {
    flex: 1,
  },
  metricValue: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
  },
  metricLabel: {
    color: '#6b7280',
    fontSize: 12,
    marginTop: 2,
  },
  serviceList: {
    gap: 10,
    marginTop: 14,
  },
  serviceCard: {
    alignItems: 'center',
    borderColor: '#e5e7eb',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    padding: 12,
  },
  serviceActive: {
    backgroundColor: '#effaf4',
    borderColor: '#00aa5b',
  },
  serviceName: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '800',
  },
  serviceDescription: {
    color: '#6b7280',
    fontSize: 12,
    marginTop: 2,
    maxWidth: 210,
  },
  serviceFare: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '800',
  },
  noteInput: {
    backgroundColor: '#f3f4f6',
    borderColor: '#e5e7eb',
    borderRadius: 8,
    borderWidth: 1,
    color: '#111827',
    fontSize: 14,
    marginTop: 14,
    minHeight: 46,
    paddingHorizontal: 12,
  },
  orderButton: {
    alignItems: 'center',
    backgroundColor: '#00aa5b',
    borderRadius: 8,
    justifyContent: 'center',
    marginTop: 14,
    minHeight: 48,
  },
  orderButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
  historySection: {
    marginTop: 18,
    paddingBottom: 10,
  },
  historyTitle: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 8,
  },
  historyItem: {
    borderTopColor: '#eef2f1',
    borderTopWidth: 1,
    paddingVertical: 10,
  },
  historyRoute: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '700',
  },
  historyMeta: {
    color: '#6b7280',
    fontSize: 12,
    marginTop: 3,
  },
});
