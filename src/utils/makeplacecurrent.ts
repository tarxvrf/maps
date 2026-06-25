import { Coordinate } from "../types/coordinate";
import { Place } from "../types/place";

export const makePlaceFromCurrentLocation = (coordinate: Coordinate): Place => ({
  ...coordinate,
  id: 'current-location',
  title: 'Lokasi saya saat ini',
  subtitle: `${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(
    5,
  )}`,
});