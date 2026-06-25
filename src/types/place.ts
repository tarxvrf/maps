import { Coordinate } from "./coordinate";

export type Place = Coordinate & {
  id: string;
  title: string;
  subtitle: string;
};
