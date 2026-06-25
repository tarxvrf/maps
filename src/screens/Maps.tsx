import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import Geolocation from 'react-native-geolocation-service';
import { PERMISSIONS, RESULTS, request } from 'react-native-permissions';
import { getDistance } from 'geolib';
import { mapstyles } from '../styles/mapstyles';
import { searchPlace } from '../services/nominatim';
import { getHistory, saveHistory } from '../services/storage';
import { Coordinate } from '../types/coordinate';
import { DEFAULT_LOCATION } from '../utils/coordinate';
import { Place } from '../types/place';
import { SearchMode } from '../types/searchmode';
import { SERVICE_OPTIONS } from '../utils/serviceoption';
import { makePlaceFromCurrentLocation } from '../utils/makeplacecurrent';
import { formatDistance } from '../utils/convertdistance';
import { formatCurrency } from '../utils/convertcurrency';
import { html } from '../html/maphtml';
import { requestPermission } from '../services/requestpermission';
import Orderbutton from '../components/Orderbutton';
import Catatantextpaket from '../components/Catatantextpaket';

export default function Maps() {
  const webviewRef = useRef<any>(null);
  const watchIdRef = useRef<number | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const MapWebView = WebView as any;
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
 
  /// hitung harga dari jarak 
  const selectedService =
    SERVICE_OPTIONS.find(item => item.id === selectedServiceId) ||
    SERVICE_OPTIONS[0]; //pilih serviceoption
            ///
  const distance = useMemo(() => {// fungsi untuk mmbuat jarak dari pickup dan tujuan
    if (!pickup || !destination) {
      return 0; 
    }
    return getDistance(  
      { latitude: pickup.latitude, longitude: pickup.longitude },
      { latitude: destination.latitude, longitude: destination.longitude },
    );
  }, [destination, pickup]);
        ///
  const fare = useMemo(() => { //fungsi untuk nentuin harga dari jarak atau tujuan
    if (!distance) {
      return 0;
    }
    return Math.ceil(
      selectedService.baseFare + (distance / 1000) * selectedService.perKm
    );
  }, [distance, selectedService]);

//end hitung harga dari jarak///

///hitung setimati waktu dari jarak ////
  const estimatedTime = useMemo(() => {
    if (!distance) {
      return selectedService.eta;
    }

    return Math.max(selectedService.eta, Math.round(distance / 420) + 8);
  }, [distance, selectedService]);
///end hitung setimati waktu dari jarak ////


  const routePayload = useMemo(
    () => ({
      current: currentLocation,
      pickup,
      destination,
    }),
    [currentLocation, destination, pickup],
  );

 

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
        setPickup(
          currentPickup =>
            currentPickup || makePlaceFromCurrentLocation(coordinate),
        );
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

  const renderSuggestion = ({ item }: { item: Place }) => (
    <Pressable
      style={mapstyles.suggestionItem}
      onPress={() => selectPlace(item)}
    >
      <View style={mapstyles.placeIcon}>
        <Text style={mapstyles.placeIconText}>
          {activeSearch === 'pickup' ? 'J' : 'T'}
        </Text>
      </View>
      <View style={mapstyles.placeText}>
        <Text style={mapstyles.placeTitle} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={mapstyles.placeSubtitle} numberOfLines={2}>
          {item.subtitle}
        </Text>
      </View>
    </Pressable>
  );

  return (
    <View style={mapstyles.container}>
      <MapWebView
        ref={webviewRef}
        originWhitelist={['*']}
        source={{ html }}
        javaScriptEnabled
        domStorageEnabled
        onLoadEnd={() =>
          webviewRef.current?.injectJavaScript(
            `window.updateMap(${JSON.stringify(routePayload)}); true;`,
          )
        }
      />

      <View style={mapstyles.topPanel}>
        <View style={mapstyles.routeInputs}>
          <View style={mapstyles.routeDots}>
            <View style={[mapstyles.routeDot, mapstyles.pickupDot]} />
            <View style={mapstyles.routeLine} />
            <View style={[mapstyles.routeDot, mapstyles.destinationDot]} />
          </View>

          <View style={mapstyles.inputGroup}>
            <TextInput
              value={pickupQuery}
              onFocus={() => setActiveSearch('pickup')}
              onChangeText={value => setSearchText('pickup', value)}
              placeholder="Alamat jemput"
              placeholderTextColor="#6b7280"
              style={[
                mapstyles.input,
                activeSearch === 'pickup' && mapstyles.inputActive,
              ]}
            />
            <TextInput
              value={destinationQuery}
              onFocus={() => setActiveSearch('destination')}
              onChangeText={value => setSearchText('destination', value)}
              placeholder="Kirim ke mana?"
              placeholderTextColor="#6b7280"
              style={[
                mapstyles.input,
                activeSearch === 'destination' && mapstyles.inputActive,
              ]}
            />
          </View>
        </View>

        <View style={mapstyles.quickActions}>
          <Pressable
            style={mapstyles.currentButton}
            onPress={useCurrentAsPickup}
          >
            <Text style={mapstyles.currentButtonText}>Pakai lokasi saya</Text>
          </Pressable>
          {isSearching && <ActivityIndicator color="#00aa5b" size="small" />}
        </View>

        {suggestions.length > 0 && (
          <FlatList
            data={suggestions}
            keyExtractor={item => item.id}
            renderItem={renderSuggestion}
            style={mapstyles.suggestions}
            keyboardShouldPersistTaps="handled"
          />
        )}
      </View>

      <View style={mapstyles.bottomSheet}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={mapstyles.summaryRow}>
            <View>
              <Text style={mapstyles.sheetEyebrow}>GoSend style</Text>
              <Text style={mapstyles.sheetTitle}>Kirim barang</Text>
            </View>
            <View style={mapstyles.priceBox}>
              <Text style={mapstyles.priceLabel}>Estimasi</Text>
              <Text style={mapstyles.priceText}>
                {fare ? formatCurrency(fare) : '-'}
              </Text>
            </View>
          </View>

          <View style={mapstyles.metricsRow}>
            <View style={mapstyles.metricItem}>
              <Text style={mapstyles.metricValue}>
                {distance ? formatDistance(distance) : '-'}
              </Text>
              <Text style={mapstyles.metricLabel}>Jarak</Text>
            </View>
            <View style={mapstyles.metricItem}>
              <Text style={mapstyles.metricValue}>{estimatedTime} menit</Text>
              <Text style={mapstyles.metricLabel}>Tiba</Text>
            </View>
            <View style={mapstyles.metricItem}>
              <Text style={mapstyles.metricValue}>
                {destination ? 'Siap' : 'Cari'}
              </Text>
              <Text style={mapstyles.metricLabel}>Status</Text>
            </View>
          </View>

          <View style={mapstyles.serviceList}>
            {SERVICE_OPTIONS.map(item => {
              const active = item.id === selectedServiceId;
              return (
                <Pressable
                  key={item.id}
                  style={[
                    mapstyles.serviceCard,
                    active && mapstyles.serviceActive,
                  ]}
                  onPress={() => setSelectedServiceId(item.id)}
                >
                  <View>
                    <Text style={mapstyles.serviceName}>{item.name}</Text>
                    <Text style={mapstyles.serviceDescription}>
                      {item.description}
                    </Text>
                  </View>
                  <Text style={mapstyles.serviceFare}>
                    {distance
                      ? formatCurrency(
                          Math.ceil(
                            item.baseFare + (distance / 1000) * item.perKm,
                          ),
                        )
                      : 'Pilih tujuan'}
                  </Text>
                </Pressable>
              );
            })}
          </View>

         <Catatantextpaket setPackageNote={setPackageNote} packageNote={packageNote} />

          <Orderbutton createorder={createOrder}/>

          {history.length > 0 && (
            <View style={mapstyles.historySection}>
              <Text style={mapstyles.historyTitle}>Riwayat terakhir</Text>
              {history.slice(0, 3).map(item => (
                <Pressable
                  key={item.id}
                  style={mapstyles.historyItem}
                  onPress={() => {
                    selectPlace(item.pickup, 'pickup');
                    selectPlace(item.destination, 'destination');
                    setSelectedServiceId(
                      SERVICE_OPTIONS.find(
                        service => service.name === item.service,
                      )?.id || 'instant',
                    );
                    setPackageNote(item.packageNote || '');
                  }}
                >
                  <Text style={mapstyles.historyRoute} numberOfLines={1}>
                    {item.pickup.title} ke {item.destination.title}
                  </Text>
                  <Text style={mapstyles.historyMeta}>
                    {item.service} - {formatDistance(item.distance)} -{' '}
                    {formatCurrency(item.fare)}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </ScrollView>
      </View>
    </View>
  );
}
