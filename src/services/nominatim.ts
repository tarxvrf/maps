export const searchPlace = async (keyword: string) => {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
      keyword,
    )}&format=json&limit=10&addressdetails=1`,
    {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'MapsReactNativeGoSendDemo/1.0',
      },
    },
  );

  return response.json();
};
