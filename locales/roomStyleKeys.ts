import type { RoomType, StyleType } from "../types";
import type { StringKey } from "./strings";

/** Maps domain room types to `STRINGS_EN` keys for labels. */
export const ROOM_TYPE_LABEL_KEY: Record<RoomType, StringKey> = {
  "Living Room": "roomType.livingRoom",
  Bedroom: "roomType.bedroom",
  Kitchen: "roomType.kitchen",
  Bathroom: "roomType.bathroom",
  "Home Office": "roomType.homeOffice",
  "Study Room": "roomType.studyRoom",
  Restaurant: "roomType.restaurant",
};

/** Maps domain interior styles to `STRINGS_EN` keys for labels. */
export const STYLE_LABEL_KEY: Record<StyleType, StringKey> = {
  Modern: "styleType.modern",
  Contemporary: "styleType.contemporary",
  Traditional: "styleType.traditional",
  Transitional: "styleType.transitional",
  "Mid-Century": "styleType.midCentury",
  Rustic: "styleType.rustic",
  Luxe: "styleType.luxe",
  Minimal: "styleType.minimal",
  Mediterranean: "styleType.mediterranean",
  Biophilic: "styleType.biophilic",
  Airbnb: "styleType.airbnb",
  "Soho Style": "styleType.sohoStyle",
  Rainbow: "styleType.rainbow",
  Cozy: "styleType.cozy",
  Coastal: "styleType.coastal",
  Japandi: "styleType.japandi",
  Cottagecore: "styleType.cottagecore",
  Wood: "styleType.wood",
};
