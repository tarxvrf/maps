import { PermissionsAndroid, Platform } from "react-native";

export const Setpermission = async ()=>{
   if (Platform.OS === 'android'){
     return true
   }
   const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    {
        title:'akses lokasi',
        message:"izinkan akses lokasi",
        buttonPositive:"izinkan"
    }
   )
   return granted === PermissionsAndroid.RESULTS.GRANTED
}