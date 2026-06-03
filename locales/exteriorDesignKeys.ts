import type {
  ExteriorSceneType,
  ExteriorStyleType,
} from "../constants/exteriorDesign";
import type { StringKey } from "./strings";

export const EXTERIOR_SCENE_LABEL_KEY: Record<ExteriorSceneType, StringKey> = {
  "Front Facade": "exteriorScene.frontFacade",
  "Backyard & Patio": "exteriorScene.backyardPatio",
  "Pool & Spa": "exteriorScene.poolSpa",
  "Garden & Landscaping": "exteriorScene.gardenLandscaping",
  "Driveway & Entry": "exteriorScene.drivewayEntry",
  "Balcony & Terrace": "exteriorScene.balconyTerrace",
  "Rooftop Deck": "exteriorScene.rooftopDeck",
  "Side Yard": "exteriorScene.sideYard",
  Courtyard: "exteriorScene.courtyard",
  "Commercial Storefront": "exteriorScene.commercialStorefront",
};

export const EXTERIOR_STYLE_LABEL_KEY: Record<ExteriorStyleType, StringKey> = {
  "Modern Facade": "exteriorStyle.modernFacade",
  "Contemporary Lines": "exteriorStyle.contemporaryLines",
  "Classic Colonial": "exteriorStyle.classicColonial",
  "Mediterranean Villa": "exteriorStyle.mediterraneanVilla",
  "Craftsman Charm": "exteriorStyle.craftsmanCharm",
  "Modern Farmhouse": "exteriorStyle.modernFarmhouse",
  "Coastal Cottage": "exteriorStyle.coastalCottage",
  "Desert Modern": "exteriorStyle.desertModern",
  "Industrial Exterior": "exteriorStyle.industrialExterior",
  "Minimal Nordic": "exteriorStyle.minimalNordic",
  "Tudor Revival": "exteriorStyle.tudorRevival",
  "Spanish Revival": "exteriorStyle.spanishRevival",
  "Tropical Resort": "exteriorStyle.tropicalResort",
  "Japandi Exterior": "exteriorStyle.japandiExterior",
  "Mid-Century Curb": "exteriorStyle.midCenturyCurb",
  "Rustic Lodge": "exteriorStyle.rusticLodge",
};
