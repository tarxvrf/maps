import { PermissionsAndroid, Platform } from "react-native";

export const Setpermission = async ()=>{
   if (Platform.OS !== 'android'){
     return true
   }
   const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
   )
   return granted === PermissionsAndroid.RESULTS.GRANTED
}