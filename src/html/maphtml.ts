import { DEFAULT_LOCATION } from "../utils/coordinate";

export const html = `
	      <!DOCTYPE html>
	      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
          <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
          <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
          <style>
            html, body, #map {
              height: 100%;
              width: 100%;
              margin: 0;
              padding: 0;
            }
            .pin {
              align-items: center;
              border-radius: 18px;
              color: white;
              display: flex;
              font-family: Arial, sans-serif;
              font-size: 12px;
              font-weight: 700;
              height: 36px;
              justify-content: center;
              width: 36px;
              box-shadow: 0 8px 18px rgba(0, 0, 0, 0.25);
            }
            .pin-current { background: #15803d; }
            .pin-pickup { background: #00aa5b; }
            .pin-destination { background: #111827; }
          </style>
        </head>
        <body>
          <div id="map"></div>
          <script>
            var map = L.map('map', { zoomControl: false }).setView([${DEFAULT_LOCATION.latitude}, ${DEFAULT_LOCATION.longitude}], 14);
            L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
              maxZoom: 19,
              attribution: 'OpenStreetMap'
            }).addTo(map);

            var currentMarker = null;
            var pickupMarker = null;
            var destinationMarker = null;
            var routeLine = null;

            function icon(className, label) {
              return L.divIcon({
                className: '',
                html: '<div class="pin ' + className + '">' + label + '</div>',
                iconSize: [36, 36],
                iconAnchor: [18, 18]
              });
            }

            function setMarker(existing, place, markerIcon, title) {
              if (!place) {
                if (existing) {
                  map.removeLayer(existing);
                }
                return null;
              }

              var latlng = [place.latitude, place.longitude];
              if (existing) {
                existing.setLatLng(latlng);
                return existing;
              }

              return L.marker(latlng, { icon: markerIcon, title: title }).addTo(map);
            }

            function updateMap(payload) {
              currentMarker = setMarker(currentMarker, payload.current, icon('pin-current', 'S'), 'Saya');
              pickupMarker = setMarker(pickupMarker, payload.pickup, icon('pin-pickup', 'J'), 'Jemput');
              destinationMarker = setMarker(destinationMarker, payload.destination, icon('pin-destination', 'T'), 'Tujuan');

              if (routeLine) {
                map.removeLayer(routeLine);
                routeLine = null;
              }

              var bounds = [];
              if (payload.current) bounds.push([payload.current.latitude, payload.current.longitude]);
              if (payload.pickup) bounds.push([payload.pickup.latitude, payload.pickup.longitude]);
              if (payload.destination) bounds.push([payload.destination.latitude, payload.destination.longitude]);

              if (payload.pickup && payload.destination) {
                routeLine = L.polyline([
                  [payload.pickup.latitude, payload.pickup.longitude],
                  [payload.destination.latitude, payload.destination.longitude]
                ], {
                  color: '#00aa5b',
                  weight: 5,
                  opacity: 0.85,
                  dashArray: '10, 8'
                }).addTo(map);
              }

              if (bounds.length > 1) {
                map.fitBounds(bounds, { padding: [54, 54], maxZoom: 15 });
              } else if (bounds.length === 1) {
                map.setView(bounds[0], 15);
              }
            }

            window.updateMap = updateMap;
          </script>
	        </body>
	      </html>
	    `;
