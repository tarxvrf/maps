import AsyncStorage from '@react-native-async-storage/async-storage';

export const saveHistory = async (item: any) => {
  const old =
    JSON.parse(
      (await AsyncStorage.getItem('history')) || '[]',
    );

  const filtered = old.filter(
    (historyItem: any) => historyItem.id !== item.id,
  );

  filtered.unshift(item);

  await AsyncStorage.setItem(
    'history',
    JSON.stringify(filtered.slice(0, 8)),
  );
};

export const getHistory = async () => {
  return JSON.parse(
    (await AsyncStorage.getItem('history')) || '[]',
  );
};
