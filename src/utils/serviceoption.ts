import { ServiceOption } from "../types/serviceoption";

export const SERVICE_OPTIONS: ServiceOption[] = [
  {
    id: 'instant',
    name: 'Instant',
    description: 'Driver terdekat, cocok untuk paket cepat',
    baseFare: 9000,
    perKm: 3300,
    eta: 18,
  },
  {
    id: 'hemat',
    name: 'Hemat',
    description: 'Lebih ekonomis untuk jarak dekat-menengah',
    baseFare: 6500,
    perKm: 2600,
    eta: 28,
  },
];