import Geolocation from 'react-native-geolocation-service';

export const getCurrentLocation =async () => {
  return  Geolocation.getCurrentPosition(
      position => position.coords,
      error => error,
      {
        enableHighAccuracy: true,
        timeout: 15000,
      },
    );
   
 
};