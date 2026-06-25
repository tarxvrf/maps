

import { StyleSheet, Text, TextInput, View } from 'react-native'
import React from 'react'
import { mapstyles } from '../styles/mapstyles';

type Catatanprops = {
  setPackageNote:(text:string)=> void;
  packageNote:string
};
const Catatantextpaket:React.FC<Catatanprops>= ({packageNote,setPackageNote}) => {
  return (
     <TextInput
            value={packageNote}
            onChangeText={setPackageNote}
            placeholder="Catatan paket, contoh: makanan, dokumen, fragile"
            placeholderTextColor="#6b7280"
            style={mapstyles.noteInput}
          />
  )
}

export default Catatantextpaket

const styles = StyleSheet.create({})