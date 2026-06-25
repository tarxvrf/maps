import { Pressable, StyleSheet, Text, View } from 'react-native';
import React from 'react';
import { mapstyles } from '../styles/mapstyles';

type Orderprops = {
  createorder: () => void;
  
};
const Orderbutton: React.FC<Orderprops> = ({ createorder }) => {
  return (
    <Pressable style={mapstyles.orderButton} onPress={createorder}>
      <Text style={mapstyles.orderButtonText}>Pesan pengirimannya</Text>
    </Pressable>
  );
};

export default Orderbutton;
