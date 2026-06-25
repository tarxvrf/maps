import {StyleSheet, View} from 'react-native';
import React from 'react';
import Maps from './src/screens/Maps';

const App = () => {
  return (
    <View style={styles.container}>
      <Maps />
    </View>
  );
};

export default App;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
