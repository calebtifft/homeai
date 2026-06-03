/** Exterior scene taxonomy — parallel to interior `RoomType`. */
export const EXTERIOR_SCENE_TYPES = [
  "Front Facade",
  "Backyard & Patio",
  "Pool & Spa",
  "Garden & Landscaping",
  "Driveway & Entry",
  "Balcony & Terrace",
  "Rooftop Deck",
  "Side Yard",
  "Courtyard",
  "Commercial Storefront",
] as const;

export type ExteriorSceneType = (typeof EXTERIOR_SCENE_TYPES)[number];

/** Dedicated exterior style catalog (not shared with interior `StyleType`). */
export const EXTERIOR_STYLES = [
  "Modern Facade",
  "Contemporary Lines",
  "Classic Colonial",
  "Mediterranean Villa",
  "Craftsman Charm",
  "Modern Farmhouse",
  "Coastal Cottage",
  "Desert Modern",
  "Industrial Exterior",
  "Minimal Nordic",
  "Tudor Revival",
  "Spanish Revival",
  "Tropical Resort",
  "Japandi Exterior",
  "Mid-Century Curb",
  "Rustic Lodge",
] as const;

export type ExteriorStyleType = (typeof EXTERIOR_STYLES)[number];
