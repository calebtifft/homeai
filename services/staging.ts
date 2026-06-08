import Constants, { ExecutionEnvironment } from "expo-constants";
import * as FileSystem from "expo-file-system/legacy";
import { FileSystemUploadType } from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import { Image, Platform } from "react-native";
import { getStagingPaletteHint, isSurprisePalette } from "../constants/colorPalettes";
import type { LanguageId } from "../constants/languages";
import {
  getWallPresetHint,
  normalizeWallColorHex,
  type WallStylePresetId,
  type WallTreatmentType,
} from "../constants/wallsDesign";
import { translate } from "../locales/strings";
import {
  createPhotoFormatError,
  extensionFromUri,
  guessMultipartImagePart,
  isPhotoFormatError,
} from "../utils/imageFormats";
import {
  httpRequestViaXhr,
  platformHttpRequest,
  type HttpResponse,
} from "../utils/iosHttp";
import { withTimeout } from "../utils/withTimeout";
import { normalizePickedImageUri } from "./pickedImage";
import type {
  DesignMode,
  ExteriorSceneType,
  ExteriorStyleType,
  RoomType,
  StagingPaletteId,
  StagingPhotoMode,
  StyleType,
} from "../types";

function effectivePhotoMode(m: StagingPhotoMode | undefined): "empty" | "furnished" {
  return m === "furnished" ? "furnished" : "empty";
}

/** Listing context for prompts (restaurant vs residential). */
function stagingListingPhrase(roomType: RoomType): string {
  if (roomType === "Restaurant") {
    return "restaurant or hospitality dining-space listing";
  }
  return "real-estate listing";
}

/** Remodela `type_room` enum is narrow—map non-residential or hybrid rooms to closest bucket. */
function mapRoomTypeToRemodelaRoom(roomType: RoomType): string {
  switch (roomType) {
    case "Living Room":
    case "Home Office":
    case "Study Room":
    case "Restaurant":
      return "livingRoom";
    case "Bedroom":
      return "bedroom";
    case "Kitchen":
      return "kitchen";
    case "Bathroom":
      return "bathroom";
    default: {
      const _exhaustive: never = roomType;
      return _exhaustive;
    }
  }
}

/** Short remodela text hint so livingRoom bucket still reads as office/study/dining when needed. */
function remodelaRoomKindPrefix(roomType: RoomType): string {
  switch (roomType) {
    case "Home Office":
      return "home office workspace interior with desk and ergonomic office chair, ";
    case "Study Room":
      return "study library reading room interior, ";
    case "Restaurant":
      return "restaurant dining hospitality interior, ";
    default:
      return "";
  }
}

function mapStyleToRemodelaPrompt(style: StyleType): string {
  switch (style) {
    case "Modern":
      return "modern";
    case "Contemporary":
      return "contemporary";
    case "Traditional":
      return "traditional";
    case "Transitional":
      return "transitional";
    case "Mid-Century":
      return "midCenturyModern";
    case "Rustic":
      return "farmhouse";
    case "Luxe":
      return "luxury";
    case "Minimal":
      return "scandinavian";
    case "Mediterranean":
      return "traditional";
    case "Biophilic":
      return "contemporary";
    case "Airbnb":
      return "scandinavian";
    case "Soho Style":
      return "luxury";
    case "Rainbow":
      return "contemporary";
    case "Cozy":
      return "transitional";
    case "Coastal":
      return "contemporary";
    case "Japandi":
      return "scandinavian";
    case "Cottagecore":
      return "farmhouse";
    case "Wood":
      return "traditional";
    default: {
      const _exhaustive: never = style;
      return _exhaustive;
    }
  }
}

function mapExteriorStyleToRemodelaPrompt(style: ExteriorStyleType): string {
  switch (style) {
    case "Modern Facade":
    case "Desert Modern":
    case "Minimal Nordic":
      return "modern";
    case "Contemporary Lines":
    case "Industrial Exterior":
    case "Tropical Resort":
      return "contemporary";
    case "Classic Colonial":
    case "Mediterranean Villa":
    case "Spanish Revival":
    case "Tudor Revival":
      return "traditional";
    case "Craftsman Charm":
    case "Modern Farmhouse":
    case "Rustic Lodge":
      return "farmhouse";
    case "Coastal Cottage":
    case "Japandi Exterior":
      return "scandinavian";
    case "Mid-Century Curb":
      return "midCenturyModern";
    default: {
      const _e: never = style;
      return _e;
    }
  }
}

/** Remodela enum has no exterior bucket — use livingRoom with explicit exterior wording in prompt. */
function mapExteriorSceneToRemodelaRoom(_scene: ExteriorSceneType): "livingRoom" {
  return "livingRoom";
}

/**
 * Prevents FLUX/adirik from mirroring asymmetric facades or swapping which wing has the larger gable.
 */
function exteriorLayoutLockClause(): string {
  return (
    "Do NOT mirror, flip, or symmetrize the facade—left and right wings stay on the same sides as " +
    "the source photo, with the same gable sizes and projections (if the larger gable is on the right, " +
    "it stays on the right). Keep each window and door in the same bay: same size, sill height, " +
    "mullion grid, and glass pattern (including leaded or decorative upper panes). Do not invent a " +
    "new centered entry, front steps, or walkway if they are not clearly visible in the source. " +
    "You may remove people, ladders, scaffolding, and renovation debris, but the building geometry " +
    "underneath must match the photo."
  );
}

/**
 * Messy renovation / debris sources need a bold curb-appeal pass — not a barely visible tweak.
 * Architecture stays locked via {@link exteriorLayoutLockClause}.
 */
function exteriorMessySourceTransformClause(): string {
  return (
    "If the source shows debris piles, tarps, peeling or patchy paint, dead grass, construction " +
    "materials, or a neglected porch, make a FULL listing-ready transformation—not a subtle " +
    "touch-up: remove all debris and tarps, repaint siding and trim evenly, replace messy ground " +
    "with manicured lawn and foundation planting, and style the porch cleanly while keeping the " +
    "same building layout, window bays, and door positions."
  );
}

/**
 * Locks every architectural element of the building exterior that diffusion models tend to drift
 * on: roofline + chimney count, soffits/fascia, gutters/downspouts, window + door count and grid,
 * existing exterior light fixtures, mailboxes, HVAC condensers, garage door size, and mature trees.
 */
function exteriorGeometryClause(photoMode: StagingPhotoMode | undefined): string {
  const furnished = effectivePhotoMode(photoMode) === "furnished";
  const layoutLock = exteriorLayoutLockClause();
  const common =
    "Preserve camera position, horizon, lens, and building massing. Keep the exact roof shape and " +
    "pitch, every chimney (count, height, and material), gutters, downspouts, soffits, fascia, " +
    "and eaves details. Keep the exact number, size, and position of all windows and doors—no " +
    "added or removed openings, no extra dormers, no new garage bays. Keep existing exterior light " +
    "fixtures, mailbox, house numbers, HVAC condensers, utility meters, hose bibs, and any visible " +
    "fence lines, gates, retaining walls, or driveway aprons exactly where they are. Mature trees " +
    "and large established shrubs stay in place (trunks and canopy)—they take years to grow. " +
    `${layoutLock}`;
  const messy = exteriorMessySourceTransformClause();
  if (furnished) {
    return `${common} ${messy} Refresh paint, trim, cladding, hardscape styling, planting layers, and outdoor furnishings only—no new wings, floors, or structural additions.`;
  }
  return `${common} ${messy} Enhance curb appeal, planting, and hardscape styling without inventing new architecture or moving the structure.`;
}

/** Density guide for exterior scenes — ensures a styled, complete refresh, not a sparse one. */
function exteriorDensityClause(
  scene: ExteriorSceneType,
  photoMode: StagingPhotoMode | undefined
): string {
  const verb = effectivePhotoMode(photoMode) === "furnished" ? "Restyle with" : "Stage with";
  switch (scene) {
    case "Front Facade":
      return `${verb} layered foundation planting (low evergreens, ornamental grasses, perennials in odd clusters), 1–2 ornamental trees only where existing planting allows, mulch beds with clean edges, and refreshed house numbers or sconces only where fixtures already exist—planters beside the entry only if a door is clearly visible; do not add new front steps, sidewalks, or a relocated entry. Replace any debris piles or bare dirt with manicured lawn. Remove tarps and construction clutter from the porch. Lawn reads healthy and trimmed.`;
    case "Backyard & Patio":
      return `${verb} a complete outdoor living set: lounge seating with throw pillows (4–6 pieces), outdoor coffee table, dining table with 4–6 chairs if footprint allows, umbrella or pergola shade where believable, planters with mixed greenery, layered string lights or lanterns, area rug, and 1–2 accent plants—warm, fully styled patio scene.`;
    case "Pool & Spa":
      return `${verb} 2–4 loungers with neat towels, 1–2 side tables, umbrella or shade structure, planters with palms or sculptural greenery, deck pots, neatly aligned pool floats only when natural, and clean coping. Water surface clear and bright—not muddy.`;
    case "Garden & Landscaping":
      return `${verb} layered tall-medium-low plant beds in odd-number clusters, ornamental trees, perennials with seasonal color, fresh mulch, defined bed edges, clear lawn margins, decorative gravel or stepping stones, and 1–2 garden focal points (bench, sculpture, urn) only where space supports.`;
    case "Driveway & Entry":
      return `${verb} clean driveway material (asphalt or pavers without cracks), 1–2 paired planters or low planting strips along the apron, refreshed garage door and trim, lit address numbers or sconces, neat lawn edge, and 1 ornamental tree if natural.`;
    case "Balcony & Terrace":
      return `${verb} a compact outdoor set: 2 lounge or bistro chairs with side table, 1–2 rail-safe or floor planters with greenery, outdoor rug, soft textiles, lantern or string lights—cohesive but not crowded.`;
    case "Rooftop Deck":
      return `${verb} modular outdoor sofa or sectional, coffee table, 4–6 dining chairs only where space allows, mixed-height planters with grasses and small trees, shade umbrella or pergola, perimeter planters or low railing planters, lighting cluster.`;
    case "Side Yard":
      return `${verb} a clean linear path (gravel, stone, or concrete pavers), narrow planting strip with low evergreens and 1–2 vertical accents (climbing greenery, slim trees), simple wall-mounted lights, restrained utility screening—do not widen the lot.`;
    case "Courtyard":
      return `${verb} a central focal element (fountain, sculptural urn, or feature tree), 2–4 lounge or dining seats around it, planters in symmetric or relaxed odd groupings against the enclosing walls, layered lighting, and gravel or paver ground material.`;
    case "Commercial Storefront":
      return `${verb} refreshed awning or canopy, clear glazing, planters flanking the entry (2–4 well-shaped specimens), refreshed sidewalk pavers if visible, restaurant or retail bistro tables only where the storefront supports outdoor seating, exterior sconces, and crisp painted trim. No invented signage text.`;
    default: {
      const _e: never = scene;
      return _e;
    }
  }
}

function exteriorProportionClause(scene: ExteriorSceneType): string {
  switch (scene) {
    case "Front Facade":
      return "Respect the photo's existing asymmetry—do not swap gable sides or rebalance wings; layer trim, siding refresh, lighting, and foundation planting without moving window or door bays; avoid crowding any visible entry with oversized shrubs.";
    case "Backyard & Patio":
      return "Define outdoor rooms with proportional seating groups, dining zones, and planting bands; keep circulation paths readable.";
    case "Pool & Spa":
      return "Keep deck or coping geometry believable; align loungers and umbrellas to pool axis without shrinking the water surface.";
    case "Garden & Landscaping":
      return "Layer tall-medium-low planting with odd-number focal clusters; maintain breathing mulch or lawn margins at beds and trees.";
    case "Driveway & Entry":
      return "Keep apron and garage door proportions; lighting and planters flank the drive without blocking sightlines.";
    case "Balcony & Terrace":
      return "Railings and planters must respect existing slab edges; furniture scaled to depth—no blocking egress.";
    case "Rooftop Deck":
      return "Keep parapet height and service penetrations; modular seating and planters follow deck grid without overhang illusions.";
    case "Side Yard":
      return "Narrow side yards: linear path, slim planting, utilitarian screens—no widening the lot in the image.";
    case "Courtyard":
      return "Enclosed walls stay fixed; central focal element with symmetric or relaxed odd seating groupings.";
    case "Commercial Storefront":
      return "Preserve storefront grid, signage zones, and sidewalk edge; refresh awnings, lighting, and entry clarity for retail appeal.";
    default: {
      const _e: never = scene;
      return _e;
    }
  }
}

function exteriorSceneStagingAnchor(
  scene: ExteriorSceneType,
  photoMode: StagingPhotoMode | undefined
): string {
  const furnished = effectivePhotoMode(photoMode) === "furnished";
  switch (scene) {
    case "Front Facade":
      return furnished
        ? "Refresh siding, trim, and paint only—keep every door and window bay exactly as photographed (same position, size, and style); add foundation planting and lighting that routes around existing openings."
        : "Add believable curb appeal—fresh paint or cladding, foundation beds, and lighting—without new wings, windows, doors, steps, or a relocated entry.";
    case "Backyard & Patio":
      return furnished
        ? "Unify decking, pavers, outdoor kitchen, seating, and planting into one cohesive outdoor living concept."
        : "Stage a complete backyard vignette—seating, dining, fire or shade elements, and layered planting that fits the visible footprint.";
    case "Pool & Spa":
      return "Keep pool shape and coping; upgrade decking, loungers, umbrellas, fencing cues, and planting to match the chosen resort or modern look.";
    case "Garden & Landscaping":
      return "Refresh beds, lawn health, ornamental trees, paths, and lighting for a maintained estate or contemporary garden feel.";
    case "Driveway & Entry":
      return "Improve driveway material consistency, apron, garage door finish, mailbox, and entry lighting for a polished arrival sequence.";
    case "Balcony & Terrace":
      return "Style rail-safe planters, compact seating, textiles, and lighting for a photoreal outdoor room on the existing slab.";
    case "Rooftop Deck":
      return "Modular seating, shade, planters, and perimeter safety elements aligned to the visible roof deck without inventing new levels.";
    case "Side Yard":
      return "Clean utility path, screening planting, storage integration—keep the narrow envelope honest.";
    case "Courtyard":
      return "Walled courtyard focal layout—fountain or seating hub with perimeter planting respecting existing enclosure.";
    case "Commercial Storefront":
      return "Retail-ready facade refresh—canopy, lighting, glazing clarity, and sidewalk merchandising cues without fictional signage text.";
    default: {
      const _e: never = scene;
      return _e;
    }
  }
}

function exteriorStyleGuide(style: ExteriorStyleType): string {
  switch (style) {
    case "Modern Facade":
      return "Modern facade: flat or gently articulated planes, large glass with dark or metal frames, minimal ornament, crisp roof edge.";
    case "Contemporary Lines":
      return "Contemporary exterior: mixed materials (wood, metal, stucco), clean horizontal lines, subtle cantilevers where the photo supports them.";
    case "Classic Colonial":
      return "Colonial: timeless painted siding or brick and traditional shutters or trim—apply only where the photo already has them; never symmetrize an asymmetric facade or move openings to center the entry.";
    case "Mediterranean Villa":
      return "Mediterranean: stucco or stone, tile roof cues, arched openings where believable, warm terracotta or sand palette.";
    case "Craftsman Charm":
      return "Craftsman: honor the photo's existing gable placement and porch columns—refresh paint, wide eaves, and artisan trim only; do not swap gable sides or redraw window grids.";
    case "Modern Farmhouse":
      return "Modern farmhouse: board-and-batten or lap siding, black window mullions, metal roof accents, welcoming porch.";
    case "Coastal Cottage":
      return "Coastal exterior: light siding, soft blue or white trim, weathered wood accents, restrained nautical cues.";
    case "Desert Modern":
      return "Desert modern: flat roofs where shown, rammed earth or smooth stucco, drought planting, sun shading devices.";
    case "Industrial Exterior":
      return "Industrial exterior: brick or metal panel rhythm, factory-style windows if compatible, utilitarian lighting.";
    case "Minimal Nordic":
      return "Nordic minimal: pale cladding, restrained black accents, simple volumes, understated entry.";
    case "Tudor Revival":
      return "Tudor: steep gables, decorative half-timber on stucco, leaded-glass cues only where photo supports.";
    case "Spanish Revival":
      return "Spanish revival: stucco, clay tile roof tone, arched details, wrought iron accents sparingly.";
    case "Tropical Resort":
      return "Tropical resort: lush palms and broadleaf planting, pool-deck luxury cues, bright clean hardscape.";
    case "Japandi Exterior":
      return "Japandi exterior: natural wood, quiet geometry, zen planting, charcoal or black trim accents.";
    case "Mid-Century Curb":
      return "Mid-century curb: low profile, ribbon windows, post-and-beam hints, kidney planters or period-appropriate landscape.";
    case "Rustic Lodge":
      return "Rustic lodge: heavy timber or log cues, stone base, forest-appropriate planting without inventing mountains.";
    default: {
      const _e: never = style;
      return _e;
    }
  }
}

function exteriorStyleGuideExcerptForLlm(style: ExteriorStyleType, maxLen = 900): string {
  const full = exteriorStyleGuide(style);
  return full.length <= maxLen ? full : `${full.slice(0, maxLen)}…`;
}

function exteriorFurnishedCohesionClause(scene: ExteriorSceneType): string {
  if (scene === "Commercial Storefront") {
    return "One coordinated commercial facade story—awnings, lighting, glazing, and sidewalk elements read as a single refresh.";
  }
  return "One coordinated outdoor design story—hardscape, planting, and furnishings read as a single intentional concept.";
}

function buildExteriorAdirikNegativePrompt(photoMode: StagingPhotoMode | undefined): string {
  const furnishedExtra =
    effectivePhotoMode(photoMode) === "furnished"
      ? ", ghost duplicate outdoor furniture, semi-transparent old chairs bleeding through, mixed clashing patio eras, cluttered duplicate planters"
      : "";
  return [
    ADIRIK_NEGATIVE_BASE,
    "wrong building, different roofline, new wings, extra floors, moved windows or doors, added windows, removed windows, fake dormers, extra garage bay, deleted garage door",
    "mirrored facade, flipped left-right, swapped gables, symmetrized asymmetric house, larger gable moved to opposite side",
    "changed window mullion pattern, replaced leaded or decorative glass with plain grids, invented front steps or walkway, relocated entry door",
    "added chimney, deleted chimney, moved chimney, missing gutters, missing downspouts, recolored soffits, mismatched fascia",
    "different camera angle, zoom, fisheye, tilted horizon, bent facade lines",
    "floating decks, impossible pools, invented second buildings, duplicated roofs, deleted mature trees, replaced existing tree species" + furnishedExtra,
    "postage stamp lawn patches, incoherent hardscape seams, shrinking driveways, missing mailbox, repositioned mailbox, deleted HVAC condenser, moved address numbers",
    "sparse barren landscape, single shrub on empty mulch, lifeless front yard, missing foundation planting",
    "invented mountain backdrop, fake ocean behind house, theme-park waterfalls",
    "people, cartoon, oversaturated, garish neon signage text",
  ].join(", ");
}

function buildExteriorAdirikPrompt(
  scene: ExteriorSceneType,
  style: ExteriorStyleType,
  promptAugmentation: string | undefined,
  photoMode: StagingPhotoMode | undefined
): string {
  const sceneWords = scene.toLowerCase();
  const styleHint = exteriorStyleGuide(style).split(". ")[0];
  const anchor = exteriorSceneStagingAnchor(scene, photoMode);
  const geo = exteriorGeometryClause(photoMode);
  const furnished = effectivePhotoMode(photoMode) === "furnished";
  const opener = furnished
    ? `A photorealistic ${sceneWords} exterior refresh for a real-estate listing in ${style} style—the photo already contains outdoor furnishings or landscaping to replace or unify: `
    : `A photorealistic ${sceneWords} exterior visualization for a real-estate listing in ${style} style: `;
  const cohesion = furnished ? `${exteriorFurnishedCohesionClause(scene)} ` : "";
  const rhythm = exteriorProportionClause(scene);
  const density = exteriorDensityClause(scene, photoMode);
  let prompt =
    `${opener}${anchor} ${styleHint}. ${geo} ` +
    (cohesion ? `${cohesion} ` : "") +
    `${rhythm} ${density} ` +
    "Magazine-quality natural light, no people, no readable text, no watermark.";
  const extra = promptAugmentation?.trim();
  if (extra) {
    prompt += ` ${extra.slice(0, 280)}`;
  }
  return prompt;
}

function buildExteriorFluxKontextPrompt(
  scene: ExteriorSceneType,
  style: ExteriorStyleType,
  promptAugmentation: string | undefined,
  photoMode: StagingPhotoMode | undefined,
  paletteId?: StagingPaletteId
): string {
  const furnished = effectivePhotoMode(photoMode) === "furnished";
  const styleHint = exteriorStyleGuide(style).split(". ")[0];

  // SAME-BUILDING framing — strongest first-token signal to FLUX Kontext.
  const sameBuildingFraming =
    "THIS IS A VIRTUAL STAGING EDIT, NOT A REMODEL. The output MUST depict the SAME building " +
    "and lot as the source photo — same facade layout (no left-right mirror), same roof, same " +
    "chimneys, same windows, same doors, same driveway, same mature trees. You may boldly refresh " +
    "paint, lawn, planting, porch styling, and remove debris or tarps; you are NOT adding, " +
    "removing, relocating, or symmetrizing any structural element.";

  // Observation directive — leverages FLUX Kontext's vision model (kept short; preserve has detail).
  const observe =
    "Observe the source photo first and read its existing roof shape, chimney count, every window " +
    "and door, gutters and downspouts, driveway edges, mature trees, mailbox, house numbers, and " +
    "utility meters — all of these MUST appear in the result exactly as photographed.";

  // Lead with preservation so FLUX commits to architectural constraints before tackling the edit.
  const preserve =
    "PRESERVATION RULES (strict, non-negotiable): Maintain the original camera angle, " +
    "perspective, and framing. Keep the roof shape and pitch, EVERY chimney (count, height, " +
    "material), every gutter and downspout, soffits, fascia, eaves, facade planes, the EXACT " +
    "window and door openings (same count, same positions, same grid), driveway edges, " +
    "hardscape boundaries, mature trees and established shrubs (trunks AND canopy), exterior " +
    "light fixtures, house numbers, mailbox, HVAC condensers, and utility meters unchanged. " +
    "DO NOT add new floors, wings, dormers, garage bays, or structural masses. DO NOT cover, " +
    "wall over, or delete any window or door. " +
    exteriorLayoutLockClause();

  // Priority rule — explicit conflict resolution between landscaping and architecture.
  const priorityRule =
    "PRIORITY RULE: When new plantings, lighting, or hardscape would conflict with an existing " +
    "window, door, light fixture, or utility, the architectural feature ALWAYS WINS — keep " +
    "plantings short enough to leave windows fully visible, route paths around utility meters, " +
    "and never let foliage cover the front door, address numbers, or mailbox.";

  const editLead = `Edit this exterior ${scene.toLowerCase()} photo for a real-estate listing.`;
  const messyTransform = exteriorMessySourceTransformClause();
  const editBody = furnished
    ? `Replace or refresh visible outdoor furniture, tarps, clutter, plantings, hardscape styling, paint, and trim toward one cohesive ${style} look. ${messyTransform}`
    : `Deliver a visible listing-ready curb-appeal transformation in ${style} style—fresh paint, lush lawn, layered planting, porch styling, and clean hardscape. ${messyTransform}`;
  const rhythm = exteriorProportionClause(scene);
  const density = exteriorDensityClause(scene, photoMode);
  const colorClause = palettePromptDirective(paletteId, "exterior");
  let prompt =
    `${editLead} ${sameBuildingFraming} ${observe} ${preserve} ${priorityRule} ${editBody} ` +
    (colorClause ? `${colorClause} ` : "") +
    `Style direction: ${styleHint}. ${rhythm} ${density} ` +
    "Photoreal, natural daylight, no people, no readable text, no watermark.";
  const extra = promptAugmentation?.trim();
  if (extra) {
    prompt += ` Additional detail: ${extra.slice(0, 500)}`;
  }
  return prompt.length > 4600 ? `${prompt.slice(0, 4597)}…` : prompt;
}

function buildExteriorRemodelaNegativePrompt(photoMode: StagingPhotoMode | undefined): string {
  const base = [
    "low quality, bad quality, sketches, cartoon",
    "wrong building, new wings, added windows, removed windows, fake dormers, different roofline, extra garage bay",
    "mirrored facade, flipped left-right, swapped gables, symmetrized asymmetric house, changed window glass pattern, invented front steps, relocated entry",
    "added chimney, deleted chimney, missing gutters, missing downspouts, recolored soffits, mismatched fascia",
    "different camera angle, zoom, rotation, fisheye",
    "people, readable text, watermark",
    "impossible pool geometry, floating decks, invented second home, deleted mature trees, replaced existing tree species",
    "missing mailbox, repositioned mailbox, deleted HVAC condenser, moved address numbers",
    "sparse barren landscape, lifeless front yard, missing foundation planting",
    "shrunken driveway, incoherent hardscape, mud-brown plant mush",
  ];
  if (effectivePhotoMode(photoMode) === "furnished") {
    base.push(
      "ghost outdoor furniture, duplicate umbrellas, mixed patio eras, cluttered duplicate planters"
    );
  }
  return base.join(", ");
}

const MOCK_PLACEHOLDER_URL =
  "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800&q=80";

/** Community models must use /v1/predictions + version id (not /v1/models/.../predictions). */
const REPLICATE_PREDICTIONS = "https://api.replicate.com/v1/predictions";
const REPLICATE_FILES = "https://api.replicate.com/v1/files";

const GEMINI_GENERATE_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Default: FLUX.1 Kontext [pro] — text-guided image editing (input_image + prompt).
 * See replicate.com/black-forest-labs/flux-kontext-pro/llms.txt
 * Switch via EXPO_PUBLIC_REPLICATE_MODEL_VERSION, e.g. adirik/interior-design:… or remodela-ai/virtual_staging_iii:…
 */
const DEFAULT_STAGING_MODEL_VERSION =
  "black-forest-labs/flux-kontext-pro:4e8d527dd58f382067616cd3ce85e6d9ff4d5ce512cc055f2cb78300ad21e27a";

/** remodela virtual_staging_iii — alternate when not using adirik schema. */
const REMODELA_INPUT_DEFAULTS = {
  num_inference_steps: 50,
  condition_scale: 0.75,
} as const;

/** Official adirik negative base from Replicate examples (llms.txt). */
const ADIRIK_NEGATIVE_BASE =
  "lowres, watermark, banner, logo, contactinfo, text, deformed, blurry, blur, out of focus, out of frame, surreal, extra, ugly, upholstered walls, fabric walls, plush walls, mirror, mirrored, functional, realistic";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fetchInitWithoutSignal(init?: RequestInit): RequestInit {
  if (!init?.signal) return init ?? {};
  const { signal: _ignored, ...rest } = init;
  return rest;
}

/** Replicate accepts data URIs for prediction inputs under ~1MB (avoids iOS multipart upload). */
const MAX_REPLICATE_DATA_URI_BYTES = 900_000;

function isExpoGoClient(): boolean {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

function approximateBase64Bytes(b64: string): number {
  return Math.floor((b64.length * 3) / 4);
}

async function readFileBase64(uri: string): Promise<string> {
  return FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
}

/**
 * iOS Expo Go: skip multipart upload — embed JPEG as data URI (Replicate-supported).
 */
async function localImageToReplicateDataUri(localUri: string): Promise<string> {
  const { fileUri, tempCopy } = await copyPickableUriToCacheIfNeeded(localUri);
  const temps: string[] = tempCopy ? [fileUri] : [];

  try {
    let { uri: jpegUri, isNewFile } = await toRgbJpegUri(fileUri);
    if (isNewFile) temps.push(jpegUri);

    let b64 = await readFileBase64(jpegUri);
    if (approximateBase64Bytes(b64) > MAX_REPLICATE_DATA_URI_BYTES) {
      const smaller = await ImageManipulator.manipulateAsync(
        jpegUri,
        [{ resize: { width: 1280 } }],
        { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG }
      );
      if (smaller.uri !== jpegUri) temps.push(smaller.uri);
      b64 = await readFileBase64(smaller.uri);
    }

    if (approximateBase64Bytes(b64) > MAX_REPLICATE_DATA_URI_BYTES) {
      const smaller = await ImageManipulator.manipulateAsync(
        jpegUri,
        [{ resize: { width: 1024 } }],
        { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG }
      );
      if (smaller.uri !== jpegUri) temps.push(smaller.uri);
      b64 = await readFileBase64(smaller.uri);
    }

    return `data:image/jpeg;base64,${b64}`;
  } finally {
    for (const uri of temps) {
      await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => { });
    }
  }
}

/**
 * On iOS use XMLHttpRequest (fetch often fails in Expo Go). Else fetch + AbortSignal timeout.
 */
async function fetchWithTimeout(
  input: string,
  init: RequestInit | undefined,
  timeoutMs: number,
  timeoutMessage: string
): Promise<HttpResponse> {
  if (Platform.OS === "ios" && isExpoGoClient()) {
    return Promise.race([
      platformHttpRequest(input, fetchInitWithoutSignal(init)),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
      }),
    ]);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await platformHttpRequest(input, {
      ...(init ?? {}),
      signal: controller.signal,
    });
  } catch (e) {
    const aborted =
      typeof e === "object" &&
      e !== null &&
      "name" in e &&
      String((e as { name?: unknown }).name) === "AbortError";
    if (aborted) {
      throw new Error(timeoutMessage);
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
}

function getEnv(key: string): string | undefined {
  return process.env[key];
}

function parseEnvInt(
  key: string,
  fallback: number,
  min: number,
  max: number
): number {
  const raw = getEnv(key)?.trim();
  if (raw == null || raw === "") return fallback;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function parseEnvFloat(
  key: string,
  fallback: number,
  min: number,
  max: number
): number {
  const raw = getEnv(key)?.trim();
  if (raw == null || raw === "") return fallback;
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * adirik defaults match Replicate examples; override with EXPO_PUBLIC_ADIRIK_* env vars.
 * Furnished/staged rooms use a higher default img2img strength so the model can replace existing pieces
 * (tune with EXPO_PUBLIC_ADIRIK_FURNISHED_PROMPT_STRENGTH).
 */
function getAdirikInferenceDefaults(photoMode: StagingPhotoMode | undefined): {
  num_inference_steps: number;
  guidance_scale: number;
  prompt_strength: number;
} {
  const furnished = effectivePhotoMode(photoMode) === "furnished";
  if (furnished) {
    return {
      num_inference_steps: parseEnvInt(
        "EXPO_PUBLIC_ADIRIK_FURNISHED_NUM_INFERENCE_STEPS",
        55,
        20,
        75
      ),
      guidance_scale: parseEnvFloat(
        "EXPO_PUBLIC_ADIRIK_FURNISHED_GUIDANCE_SCALE",
        16,
        5,
        25
      ),
      prompt_strength: parseEnvFloat(
        "EXPO_PUBLIC_ADIRIK_FURNISHED_PROMPT_STRENGTH",
        0.9,
        0.45,
        0.95
      ),
    };
  }
  return {
    num_inference_steps: parseEnvInt(
      "EXPO_PUBLIC_ADIRIK_NUM_INFERENCE_STEPS",
      50,
      20,
      75
    ),
    guidance_scale: parseEnvFloat(
      "EXPO_PUBLIC_ADIRIK_GUIDANCE_SCALE",
      15,
      5,
      25
    ),
    prompt_strength: parseEnvFloat(
      "EXPO_PUBLIC_ADIRIK_PROMPT_STRENGTH",
      0.8,
      0.35,
      0.95
    ),
  };
}

/** remodela: slightly stronger conditioning when replacing existing furniture. */
function getRemodelaDynamics(photoMode: StagingPhotoMode | undefined): {
  num_inference_steps: number;
  condition_scale: number;
} {
  const furnished = effectivePhotoMode(photoMode) === "furnished";
  if (furnished) {
    return {
      num_inference_steps: parseEnvInt(
        "EXPO_PUBLIC_REMODELA_FURNISHED_NUM_INFERENCE_STEPS",
        55,
        30,
        75
      ),
      condition_scale: parseEnvFloat(
        "EXPO_PUBLIC_REMODELA_FURNISHED_CONDITION_SCALE",
        0.82,
        0.55,
        1
      ),
    };
  }
  return {
    num_inference_steps: REMODELA_INPUT_DEFAULTS.num_inference_steps,
    condition_scale: REMODELA_INPUT_DEFAULTS.condition_scale,
  };
}

function parseSeed(): number | undefined {
  const v = getEnv("EXPO_PUBLIC_REPLICATE_SEED")?.trim();
  if (v == null || v === "") return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return Math.floor(Math.abs(n));
}

/**
 * Text conditioning aligned with the model’s internal MLSD + room-segmentation ControlNets
 * (geometry is enforced in the hosted pipeline; this phrase steers the text encoder the same way).
 * Locks down the architecture the diffusion model is most likely to drift on: window/door count
 * and position, ceiling TYPE (drop tile vs flat vs coffered), HVAC vents, sprinklers, outlets/
 * switches, floor material and tone, trim, and existing built-in millwork.
 *
 * Particularly aggressive about windows because models love to wall them over with cabinetry or
 * paneling when the room type calls for built-ins (kitchens, bathrooms). The window-mullion grid,
 * sill height, and visible exterior view must all read through into the final image.
 */
function controlNetAlignedGeometryClause(photoMode: StagingPhotoMode | undefined): string {
  const common =
    "Keep the photograph’s perspective, horizon, lens, and major straight edges. " +
    "Preserve the EXACT number, size, position, mullion grid, sill height, and outside view of " +
    "every existing window and door—no added, removed, merged, walled-over, or relocated openings. " +
    "Every window that is visible in the source photo MUST remain visible in the result; never " +
    "cover a window with cabinetry, paneling, appliances, furniture, or curtains drawn shut. " +
    "Preserve the existing ceiling TYPE exactly as photographed (drop-tile acoustic grid, coffered " +
    "panels, tray step, exposed beams, vaulted slope, or flat painted)—do not flatten a drop " +
    "ceiling, do not vault a flat ceiling, do not add or delete beams. Preserve all visible " +
    "ceiling penetrations: HVAC supply vents and return grilles, ductwork, fire sprinkler heads, " +
    "smoke detectors, recessed-light cans, ceiling fans, and access panels stay exactly where they " +
    "are. Keep crown molding, baseboards, door trim, switches, outlets, radiators, thermostats, " +
    "and built-in cabinetry positions untouched. Keep the existing floor MATERIAL, TONE, and " +
    "plank direction exactly (if the photo shows dark walnut hardwood, the result still shows dark " +
    "walnut hardwood—not light oak; if it shows ceramic tile, keep the same tile grid). Floor " +
    "color, gloss, and grain orientation do not change with the style refresh.";
  if (effectivePhotoMode(photoMode) === "furnished") {
    return `${common} Replace or refresh free-standing furniture, rugs, lighting, and decor toward the target style without inventing new walls, doors, or windows.`;
  }
  return `${common} Furnish the empty shell with believable freestanding pieces and decor—do not invent new walls, doors, windows, or built-ins.`;
}

/**
 * Cabinetry / appliance routing rule for rooms with built-ins. Diffusion models love to wall
 * windows over with continuous cabinet runs when the room type is Kitchen or Bathroom. The
 * routing clause forces them to fit cabinetry around openings, not across them.
 */
function builtInRoutingClause(roomType: RoomType): string {
  if (roomType === "Kitchen") {
    return (
      "Cabinetry routing: cabinets, uppers, tall pantries, fridge tower, range, hood, and " +
      "backsplash tile MUST NOT cover, block, or wall over any existing window or door. Route the " +
      "sink under windows with the window fully visible above the counter; use open shelving " +
      "around windows, never solid uppers across an opening. Fit the island, range, and fridge " +
      "inside the existing footprint."
    );
  }
  if (roomType === "Bathroom") {
    return (
      "Built-in routing: vanity, mirror, shower glass, and storage must not cover existing windows. " +
      "Keep windows visible above the backsplash or beside the vanity—never wall them over."
    );
  }
  return "";
}

/**
 * Density guide so empty rooms come back fully styled (and furnished rooms read complete, not
 * minimalistic). Keeps the listing-ready vibe without crossing into clutter. Counts are upper-range
 * targets; the model self-edits down for tight footprints. Critically, every room mentions a
 * staged "third layer" (decor, art, plants, soft goods) so output never feels under-furnished.
 */
function stagingDensityClause(
  roomType: RoomType,
  photoMode: StagingPhotoMode | undefined
): string {
  const furnished = effectivePhotoMode(photoMode) === "furnished";
  const verb = furnished ? "Recompose with" : "Stage with";
  switch (roomType) {
    case "Living Room":
      return (
        `${verb} a complete layered set: main sofa or sectional, 1–2 accent chairs facing it, ` +
        "coffee table, 1–2 side tables or a console, area rug sized to anchor seating, floor or table " +
        "lamps, 2–3 wall-art pieces or framed gallery, 1–2 healthy plants, throw pillows and a throw, " +
        "plus 3–5 styled decor objects (books, ceramics, tray). The room must read fully furnished, " +
        "warm, and listing-ready—never under-decorated or showroom-empty."
      );
    case "Bedroom":
      return (
        `${verb} a complete bed layout: bed with full bedding (sheets, duvet, 4–6 pillows, throw), ` +
        "two nightstands with matching or coordinated lamps, an area rug under the bed, a dresser or " +
        "wardrobe where space allows, 1–2 wall-art pieces above the bed, soft window treatment, " +
        "1 plant, and a small bench or chair if footprint permits. Plush yet curated—never just a " +
        "bed in an empty room."
      );
    case "Kitchen":
      return (
        `${verb} styled cabinetry counters: 2–3 small countertop appliances or vignettes (kettle, ` +
        "ceramic crock, cutting board with bowl), 1 small plant or herbs, fruit bowl or pitcher, " +
        "pendant or under-cabinet lighting, 2–4 styled stools at island/counter when present, and " +
        "subtle dish towel or runner. Leave generous prep space; never crowd appliances or hide them."
      );
    case "Bathroom":
      return (
        `${verb} bath-only accessories: rolled or folded towels (2–3), bath mat, soap or dispenser, ` +
        "small vanity tray with 1–2 objects, plant (snake plant or eucalyptus), framed art or mirror " +
        "styling, candle or diffuser. Keep counters mostly clear; one styled vignette beats clutter. " +
        "Absolutely no sofa, bed, coffee table, dining table, or living-room furniture."
      );
    case "Home Office":
      return (
        `${verb} a complete workspace: desk plus a clearly visible ergonomic task chair pulled up to ` +
        "it (the chair is mandatory and must not be cropped or omitted), monitor or laptop, task " +
        "lamp, desk tray and 2–3 styled accessories (notebook, pen cup, ceramic), shelving or " +
        "credenza with 4–6 styled objects, 1 plant, 1–2 framed prints, area rug under the chair zone " +
        "if floor allows. WFH-ready and warm, not just a desk."
      );
    case "Study Room":
      return (
        `${verb} a calm reading nook: desk or writing table with a visible chair, comfortable reading ` +
        "armchair, side table with table lamp, bookcase or wall shelves with curated books and 4–6 " +
        "decor objects, soft area rug, 1–2 framed prints or art, 1 plant, throw on the chair. Warm, " +
        "literary, lived-in—never sparse."
      );
    case "Restaurant":
      return (
        `${verb} a styled dining floor: 3–6 tables with chairs or banquettes (no clones—vary slight ` +
        "table styling), pendant or track lighting in odd clusters, host stand only where space " +
        "allows, decorative wall accents or art, 1–2 plants. Tables set with simple settings (no " +
        "people). Open service paths; do not block exits or kitchen openings."
      );
    default: {
      const _e: never = roomType;
      return _e;
    }
  }
}

/**
 * 3-5-7–style proportion language for staging: odd visual rhythm, rug/seating anchors, layered balance,
 * breathing room at the rug perimeter (not strict math—compressed for diffusion prompts).
 */
function proportionRhythm357Clause(roomType: RoomType): string {
  switch (roomType) {
    case "Living Room":
      return (
        "Proportion (3-5-7): treat rug + main sofa + coffee table as three anchors—rug large enough that sofa front legs sit on it; " +
        "balance sofa, accent seating, table, and rug as one seating layer; leave a visible floor band between rug edge and walls (breathing room, not wall-to-wall carpet)."
      );
    case "Bedroom":
      return (
        "Proportion (3-5-7): bed as anchor with flanking nightstands; rug sized to the bed footprint; soft layers in relaxed odd groupings; keep clear margins to walls for circulation."
      );
    case "Kitchen":
      return (
        "Proportion (3-5-7): balanced visual weight—small odd vignettes on counters or island where natural; preserve negative prep space; stools proportional to island or table."
      );
    case "Bathroom":
      return (
        "Proportion (3-5-7): calm rhythm—towels and accessories in simple odd groupings; generous negative space around vanity and shower zone; " +
        "prefer wall-mounted or floating fixtures only where the photo’s plumbing layout supports it; open shelving or slim storage over bulky cabinets when space is tight; natural accents (wood, stone, plants) sparingly—no crowding fixed fixtures."
      );
    case "Home Office":
      return (
        "Proportion (3-5-7): desk as anchor with task chair beside or behind it—chair must read fully in frame (not desk-only); odd groupings with storage; monitor or laptop zone plus task lighting; leave circulation behind the chair and clear wall strips for video calls; cable clutter hidden where believable."
      );
    case "Study Room":
      return (
        "Proportion (3-5-7): reading chair plus desk or writing table as dual anchors; bookcase rhythm in relaxed vertical thirds; rug under desk chair zone if space allows; breathing room at shelves and windows."
      );
    case "Restaurant":
      return (
        "Proportion (3-5-7): tables and chairs in clear service aisles—no blocked exits; pendant or track lighting in odd clusters over tables; host or service counter proportional to frontage; negative space for staff circulation."
      );
    default: {
      const _e: never = roomType;
      return _e;
    }
  }
}

/** Short room anchors in the spirit of adirik’s example prompts (one vivid sentence each). */
function roomTypeStagingAnchor(
  roomType: RoomType,
  photoMode: StagingPhotoMode | undefined
): string {
  const furnished = effectivePhotoMode(photoMode) === "furnished";
  switch (roomType) {
    case "Living Room":
      return furnished
        ? "Recompose the living area with a cohesive seating group, coffee table, layered lighting, and rug—swap dated pieces for a fresh listing-ready look in the same footprint; rug must read large enough to ground the sofa, not a postage stamp; clear visible packing, tools, or construction debris only when those appear in the photo—do not invent empty renovation sites."
        : "Center a believable seating arrangement, coffee table, layered lighting, and area rug sized to the visible floor—rug under at least the sofa’s front legs and visually tied to the coffee table; sectional or sofa-plus-chairs grouping should face the room’s natural focal point (fireplace, TV wall, or view) when the layout supports it.";
    case "Bedroom":
      return furnished
        ? "Refresh the bedroom with a coordinated bed, nightstands, lamps, storage, and textiles—replace or restyle existing furniture while keeping the same layout envelope; fewer high-quality pieces beat clutter—layer texture in bedding and rug without overcrowding; for luxe refreshes think channel-tufted or tailored headboard, marble or stone-top nightstands, and brass or sculptural sconces only where wall space allows."
        : "Add a bed with nightstands and lamps, dresser or wardrobe, soft textiles, and restrained wall decor that respects the room’s proportions; platform, low-profile, or upholstered bed where it suits the space; neutral base with subtle texture—airy open nightstands and soft gray or oatmeal linens work well for Scandinavian-calm moods.";
    case "Kitchen":
      return furnished
        ? "Keep every cabinet, drawer, range hood, refrigerator, dishwasher, sink, faucet, and island position exactly as photographed—no relocated plumbing, no swapped appliance footprints. Refresh counters, backsplash, island styling, hardware, and decor only; keep one coherent counter material across all runs (no mismatched stones)."
        : "Respect every existing cabinet run, sink, hood, refrigerator, range, dishwasher, and window position—do not move or replace any appliance footprint. Suggest counters and backsplash in one coherent material story; add an island or peninsula only when the photo already shows one; layer realistic small appliances and one styled vignette without crowding prep space.";
    case "Bathroom":
      return furnished
        ? "Within the existing wet zone, keep the toilet, vanity, sink, mirror, shower stall, and bathtub exactly where photographed (same count, same orientation, same plumbing wall). Refresh toward a clean modern or spa-zen look: neutral whites grays or soft sage/beige accents, streamlined mirror and lighting, minimal accessories; do not swap a tub for a shower or vice versa—work with what the photo shows."
        : "Work within the existing wet zone—do not relocate the toilet, sink, vanity, tub, or shower; preserve the plumbing wall and any existing shower stall or bathtub footprint. Stage a photoreal modern or zen bathroom: neutral palette, minimalist streamlined fixtures (wall-mount or floating vanity only if layout allows), natural light from existing windows, simple plants or stone/wood accents—functional first, no invented plumbing. Add a bathtub only when the photo already shows one or clearly reads as large/luxe.";
    case "Home Office":
      return furnished
        ? "Refresh the workspace: ergonomic desk with a task chair pulled up to it (chair must stay visible—never desk-only), storage credenza or shelving, layered task and ambient light, cable management—replace dated office pieces without moving walls, windows, or built-in millwork positions."
        : "Stage a believable home office: desk sized to the room plus a clearly visible ergonomic task chair tucked at the desk (mandatory—do not omit the chair), storage (shelving or cabinet) where footprint allows, monitor or laptop zone, task lamp, restrained wall art—photoreal WFH-ready, no invented windows.";
    case "Study Room":
      return furnished
        ? "Recompose as a quiet study: desk or writing table, reading chair, bookcase wall, soft lighting, and rug—swap conflicting furniture while keeping the same shell and window positions."
        : "Stage a calm study or library nook: desk, comfortable reading chair, bookcase or wall shelves, table lamp, area rug if space allows—warm materials, minimal visual noise, respectful of existing architecture.";
    case "Restaurant":
      return furnished
        ? "Within the existing dining floor and service paths, refresh tables, chairs, banquettes, lighting, and finishes toward the target hospitality style—no relocated structural columns, exits, or kitchen openings."
        : "Stage a photoreal dining room or front-of-house restaurant: coordinated tables and chairs or banquettes, host stand only where space allows, pendant lighting, tasteful table settings without people—preserve kitchen doors and service lanes implied in the photo.";
    default: {
      const _e: never = roomType;
      return _e;
    }
  }
}

/**
 * Style guides whose first sentence leads with minimalism vocabulary ("clean lines",
 * "minimal accessories", "negative space as a feature"). For these, the FLUX builder
 * concatenates the first TWO sentences so the materials/layering guidance reaches
 * the prompt — otherwise FLUX hears only "clean lines" and renders an empty room.
 */
function styleHintForFlux(style: StyleType): string {
  const guide = styleAndPaletteGuide(style);
  const leanStyles: ReadonlyArray<StyleType> = [
    "Modern",
    "Contemporary",
    "Mid-Century",
    "Minimal",
    "Transitional",
    "Japandi",
  ];
  const wantsExtraContext = leanStyles.includes(style);
  const parts = guide.split(". ");
  return wantsExtraContext && parts.length > 1
    ? parts.slice(0, 2).join(". ")
    : parts[0];
}

/**
 * Density emphasis for styles whose name is itself a minimalism signal applied to
 * furniture-heavy rooms (Living, Bedroom, Home Office, Study, Restaurant). Diffusion
 * models default to sparse output for "Modern Living Room" unless told otherwise.
 */
function denseStyleEmphasis(roomType: RoomType, style: StyleType): string {
  const leanStyles = new Set<StyleType>([
    "Modern",
    "Contemporary",
    "Mid-Century",
    "Minimal",
    "Transitional",
    "Japandi",
  ]);
  if (!leanStyles.has(style)) return "";
  const dense: ReadonlyArray<RoomType> = [
    "Living Room",
    "Bedroom",
    "Home Office",
    "Study Room",
    "Restaurant",
  ];
  if (!dense.includes(roomType)) return "";
  return (
    `IMPORTANT — ${style} ${roomType} is LAYERED-CLEAN, not empty-clean. ` +
    "The result MUST be FULLY FURNISHED AND STYLED: every itemized piece above must be " +
    "visible in the frame plus the styling layer (a draped throw, 4–6 mixed pillows, a " +
    "coffee-table tray with books and ceramics, gallery-arranged art on the main wall, a " +
    "floor lamp AND a table lamp, an area rug large enough to anchor the front legs of " +
    "the sofa or bed, 1–2 floor plants plus 1 tabletop plant). Bare floors, empty walls, " +
    "a single piece floating in an empty box, or a showroom-sparse render are FAILURE " +
    "MODES — do not deliver them. " +
    `Modernity comes from materials, geometry, and curation, not from emptiness.`
  );
}

function styleAndPaletteGuide(style: StyleType): string {
  switch (style) {
    case "Modern":
      return (
        "Modern listing-ready: warm, layered, and fully furnished — clean lines and calm geometry expressed through MATERIALS and CURATION, never through emptiness. The space must read as a LIVED-IN home, not a showroom or an empty box. " +
        "Mix materials for depth: warm wood tones with matte black or brushed steel, soft textiles (rug, throw, upholstery texture), ceramic or glass accents, one or two healthy plants where believable. " +
        "Include intentional styling—books, trays, desk accessories in offices, curated wall art or a lean mirror, layered lighting (ambient + task)—so the room reads rich but still modern. " +
        "Sleek surfaces and asymmetry are fine; crisp neutrals with a subtle accent (sage, camel, ink blue, or brass) rather than flat all-white emptiness. " +
        "Bathrooms: floating or wall-mounted fixtures only where believable, glass shower zones, daylight from existing windows. " +
        "Think modern open living with glass where the photo supports it, kitchens with mixed finishes not monochrome voids, bedrooms with abstract art and textured bedding, offices with a styled desk vignette—only inside this exact architecture."
      );
    case "Contemporary":
      return (
        "Contemporary listing-ready: layered sophistication with subtle textures and intentional materials — fully furnished and styled, never sparse. Mix leather and wool, soft natural fabrics, light woods with metal highlights; the room reads fresh and refined, not bare. " +
        "Open feel, unique shapes, blend of classic and new; natural fabrics, light woods, metal highlights; neutrals with bold contrasting moments. " +
        "Light coastal hints are fine when subtle; for a dedicated seaside look use the Coastal style—never invent ocean views outside windows. " +
        "Think mixed leather and wool, open kitchens with smart storage, neutral bedrooms with a statement headboard, sleek baths with glass enclosures, minimalist offices, dining with a bold accent wall or modern chandelier—faithful to the existing shell."
      );
    case "Traditional":
      return (
        "Traditional: 18th–19th century European inspiration—rich color, ornate detail, symmetrical grouping where the floor plan allows. " +
        "Elaborate furnishings, classic art, elegant fabrics; mahogany, cherry, oak; deep reds, greens, browns. " +
        "Living rooms: tufted or rolled-arm upholstery oriented toward an existing fireplace or focal wall when present, paired classic armchairs, patterned area rug, wooden coffee table, mantel vignette, floor lamp, framed art, and tailored drapery at windows—bay or standard. " +
        "Think marble fireplace seating, formal dining with crystal lighting, study with built-ins and leather, four-poster beds, wood cabinetry with stone counters, a grand foyer feel—without moving windows, doors, or walls."
      );
    case "Transitional":
      return (
        "Transitional listing-ready: traditional comfort meets modern simplicity, fully furnished and styled — simple lines and neutral schemes balanced by layered textiles, mixed wood-and-steel materials, subtle pattern, and curated decor. Clean but never sparse, restrained but never empty. " +
        "Think modern sofas with classic wood tables, shaker cabinets with stainless, neutral bedrooms mixing textures, modern vanity with traditional tile, upholstered chairs with a sleek table, contemporary desk with traditional decor—within this room only."
      );
    case "Mid-Century":
      return (
        "Mid-century modern listing-ready: warm functional layering with organic curves and low profiles — lived-in and styled, never under-decorated. Iconic teak/walnut seating, leather and tweed, abstract art, healthy plants, retro lighting, and curated decor fill the room; geometric clarity comes through the PIECES, not through emptiness. " +
        "Teak and walnut tones, molded plywood or leather-and-wood seating cues, glass; earthy olive, mustard, or burnt orange accents balanced with warm neutrals. " +
        "Abstract art and healthy plants where the room supports it; daylight from large windows or light window treatments—never a different room. " +
        "Think iconic low seating, teak dining or desk, retro lighting, flat-panel kitchen cues, organic patio-friendly shapes if the image is that space."
      );
    case "Rustic":
      return (
        "Rustic / modern farmhouse: natural materials, cozy simplicity, vintage character. " +
        "Exposed beams or reclaimed wood only if believable in the photo; stone, wrought iron; earthy muted hues. " +
        "Think stone fireplace and beams, farmhouse sink and open shelving, reclaimed bedroom pieces, long wood dining, clawfoot tub with natural stone, shiplap feeling only if it matches existing walls—no invented structure."
      );
    case "Luxe":
      return (
        "Modern luxe: opulence balanced with comfort—low-profile sofa, marble or stone coffee table with brass or bronze metal legs, sculptural accent chairs, abstract art, richly textured area rug, layered drapes or blackout panels where windows exist, floor lamp or statement pendant, tasteful greenery. " +
        "Bedrooms: channel-tufted or tailored upholstered bed, marble or lacquer nightstands, brass wall sconces or table lamps, abstract art, one cohesive neutral-to-jewel palette with metallic accents. " +
        "Elsewhere: bold pattern and texture, dramatic lighting, curated fearless color; bespoke statement pieces and artful depth—photoreal and sophisticated, not gaudy or generic glam."
      );
    case "Minimal":
      return (
        "Warm minimalism / cozy Scandinavian listing-ready: every piece intentional AND well-styled in a light airy palette (white, soft gray, oatmeal, beige) — the room is FULLY FURNISHED but considered, never bare. Include layered textiles (rug, throw, pillows), natural-wood accents, plants, art, books, and ceramics; warmth and curation over clutter, but NEVER empty walls or bare floors. " +
        "Natural wood tones (oak, birch, walnut accents), soft gray or linen bedding, airy open nightstands, textured rug, restrained art, and plants for life—hygge warmth without clutter. " +
        "Discreet storage (built-in, slim dresser, under-bed) that fits the existing footprint. Think serene guest-ready bedroom, calm spa-like bath accessories, cozy layered living, kitchen with natural materials and open negative space—fully furnished and human, never cluttered."
      );
    case "Mediterranean":
      return (
        "Mediterranean: sun-warmed European coastal villa mood—whites and creams with terracotta, sage, or ocean blue accents; arched details only if the architecture supports them; wrought iron, zellige or handmade tile feeling, rustic wood beams when believable. " +
        "Think stucco-friendly neutrals, linen upholstery, patterned pillows, olive trees in pots, casual dining al fresco feeling indoors, spa bathrooms with textured stone—no cartoon Tuscan clichés."
      );
    case "Biophilic":
      return (
        "Biophilic: design centered on nature connection—abundant healthy plants (potted trees, ferns, succulents), natural light maximized from existing windows, organic shapes, stone and wood textures, soft greens and earth tones. " +
        "Circadian-friendly layered lighting; avoid plastic-looking faux jungle; photoreal humidity-appropriate plant choices per room type."
      );
    case "Airbnb":
      return (
        "Airbnb-ready rental: broad guest appeal—crisp washable linens, durable neutral furniture, photogenic corners, curated local art, plants, clear surfaces, bright bathrooms, no personal clutter. " +
        "Think turnkey short-term rental staging: cozy but hard-wearing, Instagram-clean, every piece earns its place."
      );
    case "Soho Style":
      return (
        "Soho loft: creative urban loft—tall windows, refined mix of raw plaster or brick with contemporary furniture, black steel frames, leather or boucle icons, gallery-white walls with bold art, sculptural lighting, high-ceiling vertical rhythm. " +
        "Polished industrial edge, not messy warehouse; respect existing window grid and ceiling height—no invented skylights."
      );
    case "Rainbow":
      return (
        "Rainbow: confident coordinated color—upholstery, rug, or art carrying a spectrum tied together by repeated neutrals (white, gray, or black spine). " +
        "Curated and photoreal, not muddy brown mixes or childish primary-only chaos; avoid neon blow-out; joyful but adult."
      );
    case "Cozy":
      return (
        "Cozy: deep comfort—chunky knits, layered throws, soft area rugs, warm ambient lamps, book stacks, rounded upholstery, warm mid-to-dark neutrals with spice or wine accents. " +
        "Hygge without hoarding; readable negative space; tactile variety in textiles—inviting living, bedroom nests, and intimate dining."
      );
    case "Coastal":
      return (
        "Coastal: relaxed beach-house calm—crisp whites and soft blues, weathered light wood, linen and cotton, rattan or seagrass accents. " +
        "Subtle nautical cues only (rope texture, glass, driftwood tones)—never theme-park kitsch; respect what is outside existing windows; do not fabricate ocean horizons."
      );
    case "Japandi":
      return (
        "Japandi listing-ready: Japanese restraint meets Scandinavian warmth — FULLY furnished but considered, never an empty room. Light oak or ash pieces, layered linen and paper textures, ceramics, a statement branch or ikebana, soft textiles on seating and beds, and curated decor make the room calm AND lived-in; restraint comes through CURATION, not emptiness. " +
        "Muted palette with black or charcoal accents; wabi-sabi imperfection in materials, not broken furniture—serene bedrooms, calm living, uncluttered kitchens."
      );
    case "Cottagecore":
      return (
        "Cottagecore: romantic countryside cottage—florals, vintage wood furniture, lace or sheer curtains, open shelving with ceramics, soft pastels and cream, herbs or cut flowers, gentle clutter only where charming. " +
        "Whimsical but photoreal; avoid horror-film darkness or dirty grunge; kitchens and bedrooms feel storybook-fresh."
      );
    case "Wood":
      return (
        "Wood-forward: timber as hero—visible oak, walnut, cherry, or ash in flooring, ceiling beams, paneling, solid furniture; balance with soft textiles and pale walls so it reads warm lodge or refined cabin, not unfinished construction plywood. " +
        "Layer wood tones intentionally; pair with metal or stone for contrast in kitchens and baths."
      );
    default: {
      const _exhaustive: never = style;
      return _exhaustive;
    }
  }
}

function styleGuideExcerptForLlm(style: StyleType, maxLen = 900): string {
  const full = styleAndPaletteGuide(style);
  return full.length <= maxLen ? full : `${full.slice(0, maxLen)}…`;
}

function bathroomNoLivingFurnitureClause(roomType: RoomType): string {
  if (roomType !== "Bathroom") return "";
  return (
    "Bathroom rule: include only bathroom-appropriate fixtures and accessories (vanity, mirror, sconces, towels, bath mat, slim storage, plants) and never add living-room or bedroom furniture such as sofa, couch, armchair, coffee table, console table, dining table, TV stand, bed, or dining chairs."
  );
}

function buildAdirikNegativePrompt(
  roomType: RoomType,
  photoMode: StagingPhotoMode | undefined
): string {
  const furnishedExtra =
    effectivePhotoMode(photoMode) === "furnished"
      ? ", doubled stacked duplicate furniture, ghost furniture, semi-transparent old chairs bleeding through, mixed clashing furniture eras, cluttered duplicate decor, old staging bleeding through new, half-replaced virtual staging, mismatched wood tones fighting each other"
      : "";
  const bathroomExtra =
    roomType === "Bathroom"
      ? ", sofa, couch, loveseat, armchair, lounge chair, coffee table, dining table, bed, bedside table, TV stand, dresser, wardrobe, moved toilet, relocated tub, swapped shower for tub, swapped tub for shower"
      : "";
  const kitchenExtra =
    roomType === "Kitchen"
      ? ", moved refrigerator, relocated range, swapped sink position, deleted dishwasher, moved hood, two clashing counter materials, mismatched cabinet runs"
      : "";
  const officeExtra =
    roomType === "Home Office"
      ? ", desk without chair, missing office chair, cropped chair, desk-only composition"
      : "";
  return [
    ADIRIK_NEGATIVE_BASE,
    "wrong room, different layout, new walls, moved doors, added windows, removed windows, merged openings, walled-over window, cabinets covering window, paneling covering window, cabinetry blocking door, fake doorway, invented skylight, repositioned outlets or switches",
    "replaced drop ceiling with flat ceiling, flattened drop tile, vaulted a flat ceiling, removed acoustic tile grid, deleted HVAC supply vents, deleted return grilles, deleted ductwork, deleted fire sprinkler head, deleted smoke detector, deleted recessed light cans, added new recessed lights to a drop ceiling, painted over ceiling tile grid",
    "different camera angle, zoom, fisheye, distorted perspective",
    "warped geometry, bent walls, curved doorframes, duplicate openings, tilted horizon, floating furniture, fused objects" +
    furnishedExtra,
    "under-furnished sparse showroom-empty look, only a sofa or only a bed in an empty space, missing rug, no decor, no art, no lighting, lifeless staging",
    "postage stamp rug, rug too small for sofa, all seating completely off the rug, disconnected floating furniture, wall-to-wall carpet swallowing the room, cluttered symmetric pairs only",
    "vague luxury, generic spa clichés without specific materials, impractical floating vanities on impossible plumbing, invented skylights or new windows, changed floor material, recolored hardwood, lightened dark hardwood, darkened light hardwood, replaced tile pattern, changed plank direction",
    "invented ocean or harbor view, fake seascape outside window, theme-park nautical props",
    "clashing rainbow mud, neon oversaturation, childish primary-color chaos",
    `non-${roomType.toLowerCase()} furniture contamination${bathroomExtra}${kitchenExtra}${officeExtra}`,
    "people, cartoon, oversaturated",
  ].join(", ");
}

function furnishedCohesionClause(roomType: RoomType): string {
  switch (roomType) {
    case "Restaurant":
      return "One coordinated hospitality set—tables, chairs, banquettes or booths, lighting, and finishes read as a single concept; remove dated or conflicting pieces.";
    default:
      return "One unified furniture story—replace visible pieces so seating, tables, rug, and lighting read as a single intentional set; remove dated or conflicting staging cues.";
  }
}

/**
 * adirik is tuned for short, concrete scene prompts (llms.txt). We add one geometry line +
 * room anchor + first style sentence; optional Gemini stays short.
 */
function buildAdirikPrompt(
  roomType: RoomType,
  style: StyleType,
  promptAugmentation: string | undefined,
  photoMode: StagingPhotoMode | undefined
): string {
  const room = roomType.toLowerCase();
  const styleHint = styleHintForFlux(style);
  const anchor = roomTypeStagingAnchor(roomType, photoMode);
  const geo = controlNetAlignedGeometryClause(photoMode);
  const furnished = effectivePhotoMode(photoMode) === "furnished";
  const listing = stagingListingPhrase(roomType);
  const opener = furnished
    ? `A photorealistic ${room} restyle for a ${listing} in ${style} style—the photo already contains furniture or staging to replace or refresh: `
    : `A fully furnished, photorealistic ${room} virtually staged for a ${listing} in ${style} style: `;
  const cohesion = furnished ? furnishedCohesionClause(roomType) : "";
  const rhythm357 = proportionRhythm357Clause(roomType);
  const density = stagingDensityClause(roomType, photoMode);
  const denseEmphasis = denseStyleEmphasis(roomType, style);
  const routing = builtInRoutingClause(roomType);
  const bathroomGuard = bathroomNoLivingFurnitureClause(roomType);
  let prompt =
    `${opener}${anchor} ${styleHint}. ${geo} ` +
    (cohesion ? `${cohesion} ` : "") +
    `${rhythm357} ${density} ` +
    (denseEmphasis ? `${denseEmphasis} ` : "") +
    (routing ? `${routing} ` : "") +
    (bathroomGuard ? `${bathroomGuard} ` : "") +
    `Magazine-quality natural light, no people, no text, no watermark.`;
  const extra = promptAugmentation?.trim();
  if (extra) {
    prompt += ` ${extra.slice(0, 280)}`;
  }
  return prompt;
}

function usesAdirikInputSchema(version: string): boolean {
  const v = version.toLowerCase();
  return (
    v.includes("adirik") ||
    v.includes("interior-design") ||
    v.includes("76604baddc85b1b4616e1c6475eca080da339c8875bd4996705440484a6eac38")
  );
}

function usesFluxKontextInputSchema(version: string): boolean {
  const v = version.toLowerCase();
  return v.includes("flux-kontext") || v.includes("flux_kontext");
}

function usesRemodelaInputSchema(version: string): boolean {
  const v = version.toLowerCase();
  return v.includes("remodela") || v.includes("virtual_staging");
}

/**
 * FLUX Kontext: natural-language edit (BFL prompting guidance).
 *
 * Two non-obvious tactics matter most here:
 *  1. Lead with preservation. FLUX gives more weight to early tokens; if "add a kitchen" hits
 *     the model before "keep every window", windows lose. We therefore frame the prompt as a
 *     constrained edit: open with the edit goal, state PRESERVATION RULES, then the task body.
 *  2. Per-room layout vocabulary. Generic "seating, tables, rug, lighting, wall art" is
 *     living-room language and confuses the model when the room is a Kitchen, Bedroom, or
 *     Living Room. Each room now gets its own concrete layout sentence so FLUX can't fall
 *     back on the wrong checklist.
 *
 * FLUX Kontext has no negative_prompt input, so every "do not" clause must live in the
 * positive prompt. Repetition of critical constraints (windows, ceiling type, floor tone)
 * is intentional.
 */
/**
 * Short FLUX Kontext interior prompt (default). BFL guidance: imperative edit + brief
 * preservation — long stacked constraint blocks tend to confuse the model and hurt quality.
 */
/** Compact preservation for lean FLUX interior — stronger than a single sentence, shorter than verbose stack. */
function fluxLeanInteriorPreservationClause(
  photoMode: StagingPhotoMode | undefined
): string {
  const furnished = effectivePhotoMode(photoMode) === "furnished";
  return (
    "PRESERVE architecture: same camera, walls, ceiling type, floor material and tone, every window and door " +
    "(same count, position, mullions, sill height, outside view—never wall over, relocate, or cover with cabinets, " +
    "appliances, furniture, or drawn curtains). Keep HVAC vents, sprinklers, outlets, switches, and built-ins fixed. " +
    (furnished
      ? "Refresh freestanding furniture and decor only—no new walls, doors, or windows."
      : "Furnish the empty shell only—no new walls, doors, windows, or built-ins.") +
    " If staging conflicts with a window, door, vent, or fixture, keep the architecture and re-route staging around it."
  );
}

function buildFluxKontextPromptLean(
  roomType: RoomType,
  style: StyleType,
  promptAugmentation: string | undefined,
  photoMode: StagingPhotoMode | undefined,
  paletteId?: StagingPaletteId
): string {
  const furnished = effectivePhotoMode(photoMode) === "furnished";
  const styleHint = styleHintForFlux(style);
  const listingLabel =
    roomType === "Restaurant" ? "restaurant" : "real-estate";
  const layout = fluxInteriorLayoutLine(roomType, photoMode);
  const preserve = fluxLeanInteriorPreservationClause(photoMode);
  const routing = builtInRoutingClause(roomType);
  const colorClause = palettePromptDirective(paletteId, "interior");

  const task = furnished
    ? `Replace furniture and decor toward one cohesive ${style} look.`
    : `Add believable ${style} virtual staging: ${layout}.`;

  let prompt =
    `Edit this ${roomType.toLowerCase()} photo for a ${listingLabel} listing. ${preserve} ${task} ` +
    (colorClause ? `${colorClause} ` : "") +
    (routing ? `${routing} ` : "") +
    `Style direction: ${styleHint}. Photoreal, soft natural light, no people, no readable text.`;

  const extra = promptAugmentation?.trim();
  if (extra) {
    prompt += ` ${extra.slice(0, 240)}`;
  }
  return prompt.length > 2800 ? `${prompt.slice(0, 2797)}…` : prompt;
}

function buildFluxKontextPrompt(
  roomType: RoomType,
  style: StyleType,
  promptAugmentation: string | undefined,
  photoMode: StagingPhotoMode | undefined,
  paletteId?: StagingPaletteId
): string {
  if (!fluxVerboseInteriorPromptEnabled()) {
    return buildFluxKontextPromptLean(
      roomType,
      style,
      promptAugmentation,
      photoMode,
      paletteId
    );
  }
  const furnished = effectivePhotoMode(photoMode) === "furnished";
  const styleHint = styleHintForFlux(style);
  const listingLabel =
    roomType === "Restaurant" ? "restaurant or hospitality" : "real-estate";

  // SAME-ROOM framing — strongest first-token signal to FLUX Kontext.
  const sameRoomFraming =
    "THIS IS A VIRTUAL STAGING EDIT, NOT A REMODEL. The output MUST depict the SAME room as " +
    "the source photo — same walls, same windows, same doors, same ceiling, same floor, same " +
    "fixtures. You are ADDING furniture and decor to the existing room; you are NOT redesigning, " +
    "renovating, or rebuilding it. If you cannot fit the requested furniture without altering " +
    "architecture, use less furniture rather than touch the architecture.";

  // Observation directive — leverages FLUX Kontext's vision model (kept short; preserve has detail).
  const observe =
    "Observe the source photo first and read its existing ceiling type, floor material and tone, " +
    "every window position and mullion grid, every door, and every visible vent, sprinkler, " +
    "outlet, and switch — all of these MUST appear in the result exactly as photographed.";

  // Preservation block — placed near the top of the prompt where FLUX gives it the most weight.
  const preserve =
    "PRESERVATION RULES (strict, non-negotiable): Maintain the original camera angle, " +
    "perspective, framing, and exposure. Keep every wall, the ceiling TYPE exactly as " +
    "photographed (never flatten a drop ceiling, never vault a flat ceiling, never add or " +
    "remove beams), and the floor MATERIAL and TONE exactly (dark walnut stays dark walnut, " +
    "light oak stays light oak, tile grid stays the same pattern; do not lighten, darken, or " +
    "recolor the floor). Every window and door in the source photo MUST remain visible in the " +
    "result with the same count, size, position, mullion grid, sill height, and outside view. " +
    "DO NOT cover, wall over, paint over, or block any window with cabinets, paneling, " +
    "appliances, furniture, or drawn curtains. Preserve all visible HVAC vents, return " +
    "grilles, ductwork, sprinkler heads, smoke detectors, recessed-light cans, ceiling fans, " +
    "outlets, switches, radiators, thermostats, and built-in cabinetry positions exactly as " +
    "photographed.";

  // Priority rule — explicit conflict resolution between staging and architecture.
  const priorityRule =
    "PRIORITY RULE: When new furniture, cabinets, appliances, or built-ins would conflict with " +
    "an existing window, door, vent, sprinkler, or fixture, the architectural feature ALWAYS " +
    "WINS — re-route the staging around it. If the only available walls are windowed walls, " +
    "use MINIMAL built-ins (open shelving above counters, freestanding pieces, an under-window " +
    "sink or vanity) and keep every window fully visible above the counter line. Never fill a " +
    "wall with floor-to-ceiling cabinetry that intersects a window.";

  // Per-room layout vocabulary. Kitchen and Bathroom name built-ins + the window-routing rule.
  const layoutHint =
    roomType === "Kitchen"
      ? "a complete kitchen: cabinet runs only along windowless walls, island with 2–4 stools where footprint allows, integrated range with hood, refrigerator, dishwasher, and sink. If a window sits on the sink wall, place the sink UNDER the existing window with the window fully visible above the counter—use open shelving around it for uppers, never solid cabinetry across an opening. Tile or stone backsplash, pendant or under-cabinet lighting fitted between any existing ceiling features"
      : roomType === "Restaurant"
        ? "complete front-of-house: dining tables and chairs in clear service aisles, banquettes where space allows, rug if appropriate, pendant or track lighting in odd clusters, host or service stand where space allows, wall art"
        : roomType === "Bathroom"
          ? "bathroom-only staging (vanity, mirror, sconces, towels, bath mat, slim storage, decor) keeping all plumbing fixtures EXACTLY in place; do not relocate the toilet, tub, or shower; do not swap a tub for a shower or a shower for a tub; never wall over an existing window with vanity, tile, or shower glass; never add sofa, couch, armchair, coffee table, dining table, or bed"
          : roomType === "Home Office"
            ? "complete workspace: desk PLUS ergonomic office chair pulled up to the desk — the chair MUST be clearly visible (never desk-only or cropped); monitor or laptop, task lamp, rug under the chair zone if space allows, shelving or credenza with styled decor, framed art"
            : roomType === "Study Room"
              ? "complete study: desk or writing table with a clearly visible chair, reading armchair with side table, bookcase or wall shelves with styled books and decor, table lamp, area rug, framed art"
              : roomType === "Living Room"
                ? "complete living room: sofa or sectional, 1–2 accent chairs facing it, coffee table, 1–2 side tables or console, area rug sized to anchor seating (sofa front legs on rug), floor or table lamps, 2–3 wall-art pieces, 1–2 plants, throw pillows and a throw, plus 3–5 styled decor objects"
                : "complete bedroom: bed with full bedding (sheets, duvet, 4–6 pillows, throw), two nightstands with coordinated lamps, area rug under the bed, dresser or wardrobe where footprint allows, wall art above the bed, soft window treatment, 1 plant";

  // Imperative editing task — comes AFTER preservation so the model sees the constraints first.
  const editLead = `Edit this ${roomType.toLowerCase()} photo for a ${listingLabel} listing.`;
  const editBody = furnished
    ? `Replace or refresh visible furniture, rugs, lighting, and decor toward one cohesive ${style} look. Remove dated or conflicting staging.`
    : `Add believable virtual staging in ${style} style: ${layoutHint}.`;

  const anchor = roomTypeStagingAnchor(roomType, photoMode);
  const rhythm357 = proportionRhythm357Clause(roomType);
  const density = stagingDensityClause(roomType, photoMode);
  const denseEmphasis = denseStyleEmphasis(roomType, style);
  const routing = builtInRoutingClause(roomType);
  const bathroomGuard = bathroomNoLivingFurnitureClause(roomType);

  let prompt =
    `${editLead} ${sameRoomFraming} ${observe} ${preserve} ${priorityRule} ${editBody} ` +
    `Style direction: ${styleHint}. ${anchor} ${rhythm357} ${density}` +
    (denseEmphasis ? ` ${denseEmphasis}` : "") +
    (routing ? ` ${routing}` : "") +
    (bathroomGuard ? ` ${bathroomGuard}` : "") +
    " Photoreal, soft natural magazine lighting, no people, no readable text, no watermark.";

  const extra = promptAugmentation?.trim();
  if (extra) {
    prompt += ` Additional detail: ${extra.slice(0, 500)}`;
  }
  return prompt.length > 4600 ? `${prompt.slice(0, 4597)}…` : prompt;
}

/* ---------------------------------------------------------------------------
 * Walls-only refresh — paint / wallpaper / paneling / tile / mural / custom.
 * Prompts are deliberately surgical: edit wall surfaces only, leave ceiling,
 * floor, trim, doors, windows, and existing furniture untouched.
 * ------------------------------------------------------------------------- */

function wallsTreatmentVerb(treatment: WallTreatmentType): string {
  switch (treatment) {
    case "Paint":
      return "repaint every wall surface";
    case "Accent Wall":
      return "paint one feature wall behind the room's focal point";
    case "Wallpaper":
      return "hang new wallpaper across the wall surfaces";
    case "Wood Paneling":
      return "apply wood paneling or wainscoting on the wall surfaces";
    case "Tile":
      return "clad the wall surfaces in new tile or stone";
    case "Mural":
      return "apply a painted mural to one feature wall";
    case "Custom":
      return "refresh the wall surfaces exactly as described";
    default: {
      const _e: never = treatment;
      return _e;
    }
  }
}

function wallsScopeClause(treatment: WallTreatmentType): string {
  if (treatment === "Accent Wall" || treatment === "Mural") {
    return (
      "Change ONLY one feature wall (the wall behind the room's main focal point — sofa, bed headboard, dining banquette, or media unit). " +
      "Other walls keep their current paint or finish. Do not touch trim, baseboards, ceiling, floor, windows, doors, switches, or existing furniture."
    );
  }
  return (
    "Change ONLY the wall surfaces. Do not alter trim, baseboards, crown molding, ceiling, floor, windows, doors, light switches, outlets, or any existing furniture, appliances, or fixtures. " +
    "Keep camera angle, perspective, and lighting consistent. No new walls, no moved openings, no relit scene."
  );
}

function wallsCustomColorClause(hex: string | undefined, treatment: WallTreatmentType): string {
  const normalized = normalizeWallColorHex(hex);
  if (!normalized) return "";
  if (treatment === "Accent Wall") {
    return ` Use exactly the paint color ${normalized} on the single feature wall — match this hex faithfully without shifting hue or saturation.`;
  }
  if (treatment === "Paint" || treatment === "Custom") {
    return ` Use exactly the paint color ${normalized} on the walls — match this hex faithfully without shifting hue or saturation.`;
  }
  return ` Where any painted accent appears alongside the finish, key it to the color ${normalized}.`;
}

function wallsCustomPromptClause(extra: string | undefined): string {
  const cleaned = extra?.trim();
  if (!cleaned) return "";
  return ` Additional finish detail from the user: ${cleaned.slice(0, 280)}.`;
}

function wallsFurnishedNote(photoMode: StagingPhotoMode | undefined): string {
  if (effectivePhotoMode(photoMode) === "furnished") {
    return " The room is already furnished — preserve every piece of furniture, art, rug, and decor in its exact current position and color; only the wall surface behind/around them changes.";
  }
  return " Empty room shell — keep the architecture and any visible built-ins exactly as photographed; only the wall surface changes.";
}

function buildWallsCommonBody(params: {
  treatment: WallTreatmentType;
  presetId: WallStylePresetId;
  colorHex?: string;
  customPrompt?: string;
  photoMode?: StagingPhotoMode;
}): string {
  const verb = wallsTreatmentVerb(params.treatment);
  const presetHint = getWallPresetHint(params.presetId);
  const scope = wallsScopeClause(params.treatment);
  const colorClause = wallsCustomColorClause(params.colorHex, params.treatment);
  const customClause = wallsCustomPromptClause(params.customPrompt);
  const furnished = wallsFurnishedNote(params.photoMode);
  const normalizedHex = normalizeWallColorHex(params.colorHex);
  const hasCustomDetail = Boolean(params.customPrompt?.trim());
  /** Custom + free text + hex: put hex after the note so the model does not chase green “jungle” etc. over #RRGGBB. */
  const customHexLock =
    params.treatment === "Custom" && Boolean(normalizedHex) && hasCustomDetail;
  const middle = customHexLock
    ? `${customClause}${colorClause} The wall paint hex above overrides any conflicting wall color implied by the user text unless the user explicitly requests wallpaper, tile, paneling, or mural instead of paint.`
    : `${colorClause}${customClause}`;
  return `${verb}. ${presetHint}${middle} ${scope}${furnished}`;
}

function buildWallsAdirikPrompt(params: {
  treatment: WallTreatmentType;
  presetId: WallStylePresetId;
  colorHex?: string;
  customPrompt?: string;
  photoMode?: StagingPhotoMode;
  promptAugmentation?: string;
}): string {
  const body = buildWallsCommonBody(params);
  const opener =
    "A photorealistic walls-only refresh for a real-estate listing — surgical wall change with no other changes to the scene. ";
  let prompt =
    `${opener}${body} ` +
    "Magazine-quality natural light, no people, no readable text, no watermark.";
  const extra = params.promptAugmentation?.trim();
  if (extra) {
    prompt += ` ${extra.slice(0, 240)}`;
  }
  return prompt;
}

function buildWallsFluxKontextPrompt(params: {
  treatment: WallTreatmentType;
  presetId: WallStylePresetId;
  colorHex?: string;
  customPrompt?: string;
  photoMode?: StagingPhotoMode;
  promptAugmentation?: string;
}): string {
  const body = buildWallsCommonBody(params);
  // SAME-ROOM framing for walls — even more surgical than interior/exterior.
  const sameRoomFraming =
    "THIS IS A WALLS-ONLY REFRESH, NOT A REMODEL. The output MUST depict the SAME room as the " +
    "source photo — only the wall SURFACE finish changes. Architecture, ceiling, floor, windows, " +
    "doors, fixtures, and any existing furniture stay EXACTLY as photographed.";
  // Surgical edit: lead with preservation, then describe the wall change.
  const preserve =
    "PRESERVATION RULES (strict, non-negotiable): Maintain the original camera angle, " +
    "perspective, framing, and exposure. Keep the ceiling TYPE (drop tile, coffered, beamed, " +
    "vaulted, or flat painted — match exactly), the floor MATERIAL and TONE, baseboards, crown " +
    "molding, trim, every window, every door, outlets, switches, HVAC vents, sprinklers, light " +
    "fixtures, and every piece of existing furniture, appliance, or fixture EXACTLY untouched. " +
    "DO NOT add, remove, merge, or relocate any opening. DO NOT cover or paint over windows. " +
    "Only the wall SURFACE changes.";
  const editLead = "Edit this room photo with a walls-only refresh.";
  let prompt =
    `${editLead} ${sameRoomFraming} ${preserve} ${body} ` +
    "Photoreal, soft natural light, no people, no readable text, no watermark.";
  const extra = params.promptAugmentation?.trim();
  if (extra) {
    prompt += ` Additional detail: ${extra.slice(0, 280)}`;
  }
  return prompt.length > 4600 ? `${prompt.slice(0, 4597)}…` : prompt;
}

function buildWallsRemodelaPrompt(params: {
  treatment: WallTreatmentType;
  presetId: WallStylePresetId;
  colorHex?: string;
  customPrompt?: string;
  photoMode?: StagingPhotoMode;
  promptAugmentation?: string;
}): string {
  const body = buildWallsCommonBody(params);
  let prompt =
    `interior walls-only refresh, professional real-estate photo, surgical wall surface change only, ${body}`;
  const extra = params.promptAugmentation?.trim();
  if (extra) {
    prompt += ` ${extra.slice(0, 200)}`;
  }
  return prompt;
}

function buildWallsNegativePrompt(treatment: WallTreatmentType): string {
  const base = [
    "low quality, bad quality, blurry, out of focus, sketches, cartoon",
    "different camera angle, zoom, fisheye, distorted perspective, tilted horizon",
    "moved windows, moved doors, new openings, fake doorway, invented skylight",
    "rearranged furniture, replaced sofa, replaced bed, new appliances, deleted decor, ghost furniture",
    "changed floor, new flooring, repainted ceiling, recolored trim or baseboards",
    "warped walls, bent corners, melted moldings, dripping paint, peeling wallpaper texture artifacts",
    "people, watermark, readable text, brand logo",
  ];
  if (treatment === "Accent Wall" || treatment === "Mural") {
    base.push(
      "all walls repainted instead of one, multiple accent walls, wrap-around mural across all walls"
    );
  }
  return base.join(", ");
}

/** Short Gemini context for walls — keep the model honest about surgical edits. */
function wallsLlmContext(params: {
  treatment: WallTreatmentType;
  presetId: WallStylePresetId;
  colorHex?: string;
  customPrompt?: string;
}): string {
  const hint = getWallPresetHint(params.presetId);
  const color = normalizeWallColorHex(params.colorHex);
  const colorLine = color ? ` Custom paint color hex: ${color}.` : "";
  const customLine = params.customPrompt?.trim()
    ? ` User note: ${params.customPrompt.trim().slice(0, 200)}.`
    : "";
  return `Walls-only refresh. Treatment: ${params.treatment}. Preset note: ${hint}${colorLine}${customLine}`;
}

function fluxSafetyTolerance(): number {
  return parseEnvInt("EXPO_PUBLIC_FLUX_SAFETY_TOLERANCE", 2, 0, 2);
}

function fluxPromptUpsampling(): boolean {
  const v = getEnv("EXPO_PUBLIC_FLUX_PROMPT_UPSAMPLING")?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function fluxAspectRatio(): string {
  const v = getEnv("EXPO_PUBLIC_FLUX_ASPECT_RATIO")?.trim();
  return v && v.length > 0 ? v : "match_input_image";
}

function fluxOutputFormat(): string {
  const raw = getEnv("EXPO_PUBLIC_FLUX_OUTPUT_FORMAT")?.trim().toLowerCase();
  if (raw === "png" || raw === "webp") return raw;
  return "jpg";
}

/** When false (default), interior FLUX uses a short BFL-style edit prompt instead of the long preservation stack. */
function fluxVerboseInteriorPromptEnabled(): boolean {
  const v = getEnv("EXPO_PUBLIC_FLUX_VERBOSE_PROMPT")?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** One-line staging layout per room — kept short so FLUX Kontext can follow the edit. */
function fluxInteriorLayoutLine(
  roomType: RoomType,
  photoMode: StagingPhotoMode | undefined
): string {
  const furnished = effectivePhotoMode(photoMode) === "furnished";
  if (furnished) {
    return "refresh all visible furniture and decor toward one cohesive set";
  }
  switch (roomType) {
    case "Kitchen":
      return "complete kitchen with cabinets on windowless walls, island if space allows, range, fridge, sink, backsplash, and stools";
    case "Bathroom":
      return "bathroom accessories only—vanity, mirror, towels, mat; keep all plumbing fixtures in place";
    case "Home Office":
      return "desk, visible task chair, monitor, task lamp, shelving, rug under chair zone";
    case "Study Room":
      return "desk, reading chair, bookcase, table lamp, area rug";
    case "Living Room":
      return "sofa, accent chairs, coffee table, area rug anchoring seating, lamps, wall art, plants";
    case "Bedroom":
      return "bed with full bedding, two nightstands with lamps, area rug, dresser, wall art";
    case "Restaurant":
      return "dining tables and chairs, banquettes where natural, pendant lighting, wall art";
    default: {
      const _e: never = roomType;
      return _e;
    }
  }
}

function buildRemodelaNegativePrompt(
  roomType: RoomType,
  photoMode: StagingPhotoMode | undefined
): string {
  const base = [
    "low quality, bad quality, sketches, bad anatomy, bad hands, missing fingers, extra digit, fewer digits, cropped, worst quality",
    "wrong room, different layout, new walls, moved doors, added windows, removed windows, merged openings, walled-over window, cabinets covering window, paneling covering window, cabinetry blocking door, repositioned outlets or switches",
    "replaced drop ceiling with flat ceiling, flattened drop tile, vaulted a flat ceiling, removed acoustic tile grid, deleted HVAC vents, deleted ductwork, deleted sprinkler, deleted smoke detector, deleted ceiling fan, painted over ceiling tile grid",
    "changed floor material, recolored hardwood, lightened dark hardwood, darkened light hardwood, replaced tile pattern, changed plank direction, repainted ceiling, swapped trim color",
    "different camera angle, zoom, rotation, fisheye",
    "people, text, watermark, cartoon",
    "under-furnished sparse showroom-empty look, single sofa floating alone, single bed in empty room, no decor, missing lighting, no art, lifeless staging",
  ];
  if (effectivePhotoMode(photoMode) === "furnished") {
    base.push(
      "ghost furniture, duplicate sofas, stacked tables, mixed staging styles, cluttered decor, old furniture bleeding through"
    );
  }
  base.push(
    "postage stamp rug, rug dwarfed by sofa, all furniture floating off rug, wall-to-wall carpet with no visible floor margin",
    "impossible bathroom layout, relocated toilet or tub, swapped tub for shower, swapped shower for tub, invented plumbing, cluttered zen knickknacks",
    "moved refrigerator, relocated range, swapped sink position, deleted dishwasher, two clashing kitchen counter materials",
    "invented ocean view outside window, fake coastal backdrop"
  );
  if (roomType === "Bathroom") {
    base.push(
      "sofa, couch, loveseat, armchair, coffee table, dining table, bed, TV stand, living-room furniture in bathroom"
    );
  }
  if (roomType === "Home Office") {
    base.push("desk without chair, missing office chair, cropped chair");
  }
  return base.join(", ");
}

type GeminiGenerateResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
  error?: { message?: string };
};

function geminiAugmentExplicitlyOff(): boolean {
  const v = getEnv("EXPO_PUBLIC_GEMINI_PROMPT_AUGMENT")?.trim().toLowerCase();
  return v === "0" || v === "false" || v === "no";
}

function geminiVisionEnabled(): boolean {
  const v = getEnv("EXPO_PUBLIC_GEMINI_USE_VISION")?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** Arguments for `generateStagedImage` (interior, exterior, or walls). */
export type GenerateStagedImageParams = {
  imageUri: string;
  designMode?: DesignMode;
  roomType?: RoomType;
  style?: StyleType;
  exteriorSceneType?: ExteriorSceneType;
  exteriorStyle?: ExteriorStyleType;
  /** Walls-only refresh fields (used when `designMode === "walls"`). */
  wallTreatment?: WallTreatmentType;
  wallStyle?: WallStylePresetId;
  wallColorHex?: string;
  wallCustomPrompt?: string;
  photoMode?: StagingPhotoMode;
  paletteId?: StagingPaletteId;
};

function palettePromptDirective(
  paletteId: StagingPaletteId | undefined,
  mode: DesignMode = "interior"
): string | undefined {
  if (!paletteId) return undefined;
  const hint = getStagingPaletteHint(paletteId).trim();
  if (!hint) return undefined;
  if (isSurprisePalette(paletteId)) {
    return `Color direction: ${hint}`;
  }
  if (mode === "exterior") {
    return (
      "Apply this color palette across outdoor furnishings, planters, entry decor, mulch or stone accents, " +
      "and trim or door paint touches—keep the roof and main facade materials believable and photoreal: " +
      hint
    );
  }
  if (mode === "walls") {
    return `Color direction for accents only (do not override the chosen wall finish): ${hint}`;
  }
  return (
    "Apply this color palette across upholstery, rugs, art, pillows, throws, and decor accents " +
    "(not the floor or ceiling)—photoreal and cohesive: " +
    hint
  );
}

function combinePromptAugmentation(
  promptAugmentation: string | undefined,
  paletteId: StagingPaletteId | undefined,
  opts?: { omitPalette?: boolean; designMode?: DesignMode }
): string | undefined {
  const extra = promptAugmentation?.trim();
  const palette = opts?.omitPalette
    ? undefined
    : palettePromptDirective(paletteId, opts?.designMode ?? "interior");
  if (extra && palette) return `${extra}. ${palette}`;
  return extra || palette;
}

/**
 * Optional Gemini pass: short phrase to enrich adirik’s text conditioning (Stable Diffusion–class).
 * Non-fatal on failure. The adirik endpoint does not expose separate LoRA/ControlNet image inputs;
 * those run inside the hosted pipeline per the model README.
 */
async function tryAugmentStagingPrompt(
  params: GenerateStagedImageParams
): Promise<string | undefined> {
  if (geminiAugmentExplicitlyOff()) return undefined;
  if (Platform.OS === "ios" && isExpoGoClient()) return undefined;
  const apiKey = getEnv("EXPO_PUBLIC_GEMINI_API_KEY")?.trim();
  if (!apiKey) return undefined;

  const stagingVersion =
    getEnv("EXPO_PUBLIC_REPLICATE_MODEL_VERSION")?.trim() ||
    DEFAULT_STAGING_MODEL_VERSION;
  const isFlux = usesFluxKontextInputSchema(stagingVersion);

  const model =
    getEnv("EXPO_PUBLIC_GEMINI_MODEL")?.trim() || "gemini-2.0-flash";
  const mode = params.designMode ?? "interior";
  const fluxInteriorLean =
    isFlux && mode === "interior" && !fluxVerboseInteriorPromptEnabled();
  const styleCtx =
    mode === "exterior" && params.exteriorStyle
      ? exteriorStyleGuideExcerptForLlm(params.exteriorStyle)
      : params.style
        ? fluxInteriorLean
          ? styleHintForFlux(params.style)
          : styleGuideExcerptForLlm(params.style)
        : "";
  const paletteCtx = palettePromptDirective(params.paletteId, mode);

  let visionThumb: string | null = null;
  if (geminiVisionEnabled() && Platform.OS !== "web" && !/^https?:\/\//i.test(params.imageUri)) {
    try {
      const out = await ImageManipulator.manipulateAsync(
        params.imageUri,
        [{ resize: { width: 768 } }],
        { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG }
      );
      visionThumb = out.uri;
    } catch {
      visionThumb = null;
    }
  }
  // When we actually attach the source photo, Gemini can produce a scene-specific
  // preservation directive. Without it, instructions are generic (worse for drift).
  const useVision = visionThumb !== null;

  const furnished = effectivePhotoMode(params.photoMode) === "furnished";

  let instruction: string;
  if (
    mode === "walls" &&
    params.wallTreatment &&
    params.wallStyle
  ) {
    const wallsCtx = wallsLlmContext({
      treatment: params.wallTreatment,
      presetId: params.wallStyle,
      colorHex: params.wallColorHex,
      customPrompt: params.wallCustomPrompt,
    });
    const fluxLead = isFlux
      ? (useVision
        ? "You are looking at the attached source photo for a walls-only refresh task. Step 1: silently READ the photo and identify — how many wall planes are visible, the existing wall surface (painted drywall / brick / panel / wallpaper / tile), ceiling type, floor material, baseboards/trim, every window and door, and any visible furniture or fixtures. Step 2: write ONE imperative English instruction (max 360 characters) for the FLUX Kontext image editor that (a) names the new wall finish concretely, (b) explicitly names which features must stay untouched in this specific photo (\"keep the drop-tile ceiling, the three south-wall windows, and the dark walnut floor\"), and (c) confirms only the wall surface changes. "
        : "You write one concise English instruction (max 260 characters) for the FLUX Kontext image editor: imperative, surgical, name the wall finish only. Say what to keep fixed: ceiling, floor, baseboards, trim, windows, doors, every piece of existing furniture, camera. ")
      : "You write a single short phrase (max 220 characters) to help an interior diffusion model perform a walls-only refresh. Be specific about the wall finish. ";
    const wallsHexLocked = Boolean(normalizeWallColorHex(params.wallColorHex));
    instruction =
      fluxLead +
      `${wallsCtx} ` +
      (paletteCtx && !wallsHexLocked
        ? `Palette direction (subtle accent only, do not repaint walls a different color): ${paletteCtx}. `
        : "") +
      (isFlux
        ? `Output one English instruction only. No quotes or preamble.`
        : `Output one English phrase only: concrete wall finish cues. No furniture changes. No quotes or preamble.`);
  } else if (mode === "exterior" && params.exteriorSceneType && params.exteriorStyle) {
    const sceneNote = furnished
      ? "Outdoor areas already show furniture or plantings—drive replacement toward ONE cohesive exterior story (hardscape, plant palette, furnishings). Use swap verbs: replace, unify, resurface. "
      : "";
    const proportionHint =
      "Exterior composition: respect roofline, every chimney, gutters and downspouts, facade rhythm, window grid (same count, same left-right positions—never mirror or swap gables), walks, lot lines, mature trees, and existing exterior lights/mailbox/HVAC; layer planting in odd clusters; keep driveways and pools geometrically honest—no new wings or floors. ";
    const densityHint =
      "Layer the scene fully: foundation planting in odd clusters, layered tall-medium-low greenery, refreshed mulch beds with clean edges, ornamental tree(s) where natural, planters or pots flanking the entry, and balanced lighting—never leave the lawn or facade barren or under-styled. If the source is messy (debris, tarps, peeling paint, dead grass), instruct a bold cleanup and restyle—not a subtle touch-up. ";
    const specificityHint =
      "Name specific exterior materials (fiber-cement lap, standing-seam metal roof tone, bluestone treads, ipe decking, bronze sconces); avoid vague curb-appeal clichés; never invent a different building or fake backdrop geography. ";
    const fluxLead = isFlux
      ? (useVision
        ? "You are looking at the attached source photo for an exterior virtual staging task. Step 1: silently READ the photo and identify — roof shape and pitch, how many chimneys and where, every window and door with its position, gutters and downspouts, the driveway edges, hardscape materials, mature trees and shrubs, exterior lights, mailbox, house numbers, HVAC condensers, utility meters, AND any debris piles, tarps, peeling paint, or construction mess. Step 2: write ONE imperative English instruction (max 480 characters) for the FLUX Kontext image editor that (a) if the source is messy, demands a bold listing-ready cleanup (remove debris/tarps, repaint siding, manicured lawn)—not a subtle tweak; (b) names photo-specific planting that routes around what you saw; (c) explicitly tells FLUX to keep the exact architectural features you identified (name them—never mirror gables); (d) names the scene and style with concrete materials. "
        : "You write one concise English instruction (max 300 characters) for the FLUX Kontext image editor: imperative, specific, name facade and landscape materials. Say what to keep fixed: roof, chimneys, gutters, windows (same count), doors, driveway, mature trees, mailbox, camera. ")
      : `You write a single short phrase (max ${furnished ? 260 : 220} characters) to help an architecture/landscape diffusion model. `;
    instruction =
      fluxLead +
      proportionHint +
      densityHint +
      specificityHint +
      `Scene: "${params.exteriorSceneType}". Style: "${params.exteriorStyle}". ` +
      sceneNote +
      (paletteCtx ? `Palette direction: ${paletteCtx}. ` : "") +
      `Notes:\n${styleCtx}\n\n` +
      (isFlux
        ? `Output one English instruction only. No quotes or preamble.`
        : `Output one English phrase only: concrete exterior and landscape cues. No new structure. No quotes or preamble.`);
  } else if (params.roomType && params.style) {
    const sceneNote = furnished
      ? "The room is already furnished or virtually staged—output must drive full replacement toward ONE cohesive set (seating, tables, rug, lighting), not empty-room filler. Prefer concrete swap verbs (replace, unify, upgrade). "
      : "";
    const proportion357Hint =
      "Interior 3-5-7 balance: odd visual rhythm where natural; rug anchors main seating (living: sofa front legs on rug); five-piece seating area reads proportional; leave visible floor margin at rug perimeter for breathing room; avoid tiny rugs or disconnected floating furniture. ";
    const densityHint =
      "Stage the room fully: include the third layer (decor, art, plants, throws, books, lamps, styled objects) so it reads warm and listing-ready—never a single piece floating in an empty box. Living rooms need rug+seating+side tables+lighting+art+plants+decor; bedrooms need bed+full bedding+two nightstands+lamps+rug+art+art-on-walls; offices need desk+visible chair+lamp+shelving+decor. ";
    const specificityHint =
      "Name specific materials and fixture types (e.g. marble coffee table with brass base, channel-tufted bed, tufted sofa facing fireplace); avoid vague beautify or generic mood words; keep layouts practical—do not imply moving plumbing, wet-zone boundaries, kitchen appliances, or changing the real view outside windows. ";
    const fluxLead = isFlux
      ? (useVision
        ? "You are looking at the attached source photo for a virtual staging task. Step 1: silently READ the photo and identify, specifically — how many windows are visible and on which walls; ceiling TYPE (drop-tile acoustic grid / coffered / tray / beamed / vaulted / flat painted); floor MATERIAL and TONE (e.g. dark walnut hardwood, light oak, polished concrete, tile pattern); every door; any HVAC vents, sprinklers, smoke detectors, recessed cans, or fixed light fixtures. Step 2: write ONE imperative English instruction (max 480 characters) for the FLUX Kontext image editor that (a) names photo-specific staging — never suggest cabinets on a windowed wall if every wall has windows; route built-ins around whatever you actually saw; (b) explicitly tells FLUX to keep the exact features you identified (name them — \"the three south-wall windows\", \"the drop-tile ceiling with center vent\", etc.); (c) names the room and style with concrete materials. "
        : "You write one concise English instruction (max 300 characters) for the FLUX Kontext image editor: imperative, specific, name materials and furniture pieces. Say what to keep fixed: walls, windows (same count, never covered by cabinetry), doors, floor (same material AND tone), ceiling TYPE (drop tile / coffered / vaulted / flat — match the photo), HVAC vents and sprinklers, outlets, kitchen appliances, bath plumbing, camera. ")
      : `You write a single short phrase (max ${furnished ? 260 : 220} characters) to help an interior-design diffusion model ` +
      `(already backed by layout ControlNets when not using FLUX). `;
    instruction =
      fluxLead +
      proportion357Hint +
      densityHint +
      specificityHint +
      `Room: "${params.roomType}". Style: "${params.style}". ` +
      sceneNote +
      (paletteCtx ? `Palette direction: ${paletteCtx}. ` : "") +
      `Notes:\n${styleCtx}\n\n` +
      (isFlux
        ? `Output one English instruction only. No quotes or preamble.`
        : `Output one English phrase only: concrete furniture/lighting/material cues. No new architecture. No quotes or preamble.`);
  } else {
    return undefined;
  }

  const parts: Array<
    | { text: string }
    | { inline_data: { mime_type: string; data: string } }
  > = [{ text: instruction }];

  if (visionThumb) {
    try {
      const b64 = await FileSystem.readAsStringAsync(visionThumb, {
        encoding: "base64",
      });
      parts.push({ inline_data: { mime_type: "image/jpeg", data: b64 } });
    } catch {
      // text-only
    } finally {
      if (visionThumb !== params.imageUri) {
        await FileSystem.deleteAsync(visionThumb, { idempotent: true }).catch(() => { });
      }
    }
  }

  const url = `${GEMINI_GENERATE_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  try {
    const res = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: {
            // Vision pass needs room for observations + the directive. Text-only stays tight.
            maxOutputTokens: isFlux ? (useVision ? 380 : 260) : useVision ? 320 : furnished ? 240 : 200,
            temperature: isFlux ? 0.3 : furnished ? 0.32 : 0.35,
          },
        }),
      },
      20000,
      "Gemini prompt augmentation timed out."
    );
    const raw = await res.text();
    if (!res.ok) {
      if (__DEV__) {
        console.warn("[HomeAI] Gemini augment HTTP", res.status, raw.slice(0, 200));
      }
      return undefined;
    }
    const data = JSON.parse(raw) as GeminiGenerateResponse;
    if (data.error?.message) {
      if (__DEV__) {
        console.warn("[HomeAI] Gemini augment:", data.error.message);
      }
      return undefined;
    }
    const text = data.candidates?.[0]?.content?.parts
      ?.map((p) => p.text)
      .filter(Boolean)
      .join(" ")
      ?.trim();
    if (!text) return undefined;
    const fluxCap =
      isFlux && mode === "interior" && !fluxVerboseInteriorPromptEnabled()
        ? 220
        : isFlux
          ? 340
          : furnished
            ? 320
            : 280;
    return text
      .replace(/^["']+|["']+$/g, "")
      .slice(0, fluxCap);
  } catch (e) {
    if (__DEV__) {
      console.warn("[HomeAI] Gemini augment failed:", e);
    }
    return undefined;
  }
}

type ReplicateFileCreateResponse = {
  urls?: { get?: string };
};

async function copyPickableUriToCacheIfNeeded(localUri: string): Promise<{
  fileUri: string;
  tempCopy: boolean;
}> {
  if (localUri.startsWith("file://")) {
    return { fileUri: localUri, tempCopy: false };
  }
  const baseDir = FileSystem.cacheDirectory;
  if (!baseDir) {
    throw new Error(
      "Cannot read this image path for upload. Try picking the photo again, or use iOS/Android (not web)."
    );
  }
  const ext = extensionFromUri(localUri);
  const dest = `${baseDir}homeai-replicate-${Date.now()}${ext}`;
  try {
    await FileSystem.copyAsync({ from: localUri, to: dest });
    return { fileUri: dest, tempCopy: true };
  } catch {
    const normalized = await normalizePickedImageUri(localUri);
    return { fileUri: normalized, tempCopy: normalized !== localUri };
  }
}

function multipartFileUri(localUri: string): string {
  if (!localUri.startsWith("file://") && !/^https?:\/\//i.test(localUri)) {
    return `file://${localUri}`;
  }
  return localUri;
}

async function uploadReplicateFileViaFileSystem(
  token: string,
  localUri: string,
  mimeType: string
): Promise<string> {
  const result = await withTimeout(
    FileSystem.uploadAsync(REPLICATE_FILES, localUri, {
      uploadType: FileSystemUploadType.MULTIPART,
      fieldName: "content",
      mimeType,
      headers: {
        Authorization: `Token ${token}`,
      },
      parameters: {
        metadata: "{}",
      },
    }),
    90_000,
    "Replicate file upload timed out."
  );

  if (result.status < 200 || result.status >= 300) {
    throw new Error(
      `Replicate file upload ${result.status}: ${result.body?.slice(0, 500) ?? ""}`
    );
  }

  const data = JSON.parse(result.body) as ReplicateFileCreateResponse;
  const url = data.urls?.get;
  if (!url) {
    throw new Error("Replicate file response missing urls.get.");
  }
  return url;
}

async function uploadReplicateFileViaHttp(
  token: string,
  localUri: string,
  fileName: string,
  mimeType: string,
  transport: "fetch" | "xhr"
): Promise<string> {
  const form = new FormData();
  form.append(
    "content",
    {
      uri: multipartFileUri(localUri),
      name: fileName,
      type: mimeType,
    } as unknown as Blob
  );

  const init: RequestInit = {
    method: "POST",
    headers: {
      Authorization: `Token ${token}`,
    },
    body: form,
  };

  const res =
    transport === "xhr"
      ? await httpRequestViaXhr(REPLICATE_FILES, init)
      : await fetchWithTimeout(
          REPLICATE_FILES,
          init,
          90_000,
          "Replicate file upload timed out."
        );
  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`Replicate file upload ${res.status}: ${raw}`);
  }
  const data = JSON.parse(raw) as ReplicateFileCreateResponse;
  const url = data.urls?.get;
  if (!url) {
    throw new Error("Replicate file response missing urls.get.");
  }
  return url;
}

async function uploadReplicateFileViaFetch(
  token: string,
  localUri: string,
  fileName: string,
  mimeType: string
): Promise<string> {
  return uploadReplicateFileViaHttp(token, localUri, fileName, mimeType, "fetch");
}

const MAX_STAGING_EDGE = 2048;

async function toRgbJpegUri(sourceUri: string): Promise<{
  uri: string;
  isNewFile: boolean;
}> {
  let actions: ImageManipulator.Action[] = [];
  try {
    const dim = await new Promise<{ width: number; height: number }>(
      (resolve, reject) => {
        Image.getSize(
          sourceUri,
          (width, height) => resolve({ width, height }),
          (e) => reject(e ?? new Error("getSize failed"))
        );
      }
    );
    const longest = Math.max(dim.width, dim.height);
    if (longest > MAX_STAGING_EDGE) {
      const scale = MAX_STAGING_EDGE / longest;
      const w = Math.max(1, Math.round(dim.width * scale));
      actions = [{ resize: { width: w } }];
    } else {
      actions = [{ resize: { width: dim.width } }];
    }
  } catch {
    actions = [{ resize: { width: 1024 } }];
  }

  try {
    const out = await ImageManipulator.manipulateAsync(sourceUri, actions, {
      compress: 0.9,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    return { uri: out.uri, isNewFile: out.uri !== sourceUri };
  } catch (e) {
    if (Platform.OS === "web") {
      return { uri: sourceUri, isNewFile: false };
    }
    const msg = e instanceof Error ? e.message : String(e);
    throw createPhotoFormatError(msg);
  }
}

async function uploadLocalImageToReplicate(
  token: string,
  localUri: string
): Promise<string> {
  const { name, type } = guessMultipartImagePart(localUri);
  const { fileUri, tempCopy } = await copyPickableUriToCacheIfNeeded(localUri);

  const { uri: uploadUri, isNewFile: jpegTemp } = await toRgbJpegUri(fileUri);
  const uploadName = jpegTemp ? `homeai-${Date.now()}.jpg` : name;
  const uploadMime = jpegTemp ? "image/jpeg" : type;

  try {
    if (Platform.OS === "web") {
      return await uploadReplicateFileViaFetch(
        token,
        uploadUri,
        uploadName,
        uploadMime
      );
    }

    const uploadAttempts: Array<{
      label: string;
      run: () => Promise<string>;
    }> =
      Platform.OS === "ios"
        ? [
            {
              label: "fetch",
              run: () =>
                uploadReplicateFileViaFetch(
                  token,
                  uploadUri,
                  uploadName,
                  uploadMime
                ),
            },
            {
              label: "FileSystem",
              run: () =>
                uploadReplicateFileViaFileSystem(token, uploadUri, uploadMime),
            },
            {
              label: "XHR",
              run: () =>
                uploadReplicateFileViaHttp(
                  token,
                  uploadUri,
                  uploadName,
                  uploadMime,
                  "xhr"
                ),
            },
          ]
        : [
            {
              label: "FileSystem",
              run: () =>
                uploadReplicateFileViaFileSystem(token, uploadUri, uploadMime),
            },
            {
              label: "fetch",
              run: () =>
                uploadReplicateFileViaFetch(
                  token,
                  uploadUri,
                  uploadName,
                  uploadMime
                ),
            },
          ];

    let lastErr: unknown;
    for (let i = 0; i < uploadAttempts.length; i++) {
      const attempt = uploadAttempts[i];
      try {
        return await attempt.run();
      } catch (err) {
        lastErr = err;
        const msg = err instanceof Error ? err.message : String(err);
        const next = uploadAttempts[i + 1];
        if (next) {
          console.warn(
            `[HomeAI] Replicate ${attempt.label} upload failed, trying ${next.label}:`,
            msg
          );
        }
      }
    }
    throw lastErr instanceof Error
      ? lastErr
      : new Error("Replicate file upload failed.");
  } catch (err) {
    throw err;
  } finally {
    if (jpegTemp) {
      await FileSystem.deleteAsync(uploadUri, { idempotent: true }).catch(() => { });
    }
    if (tempCopy) {
      await FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => { });
    }
  }
}

async function resolveImageInputUrl(
  token: string,
  imageUri: string
): Promise<string> {
  if (/^https?:\/\//i.test(imageUri)) {
    return imageUri;
  }
  // Expo Go only: embed JPEG as data URI (multipart upload is unreliable there).
  // Dev client + App Store builds upload via FileSystem first — avoids ~1MB JSON POSTs
  // that often fail on real iPhones (simulator may still succeed with data URIs).
  if (Platform.OS === "ios" && isExpoGoClient()) {
    try {
      return await localImageToReplicateDataUri(imageUri);
    } catch (e) {
      if (__DEV__) {
        console.warn("[HomeAI] iOS data URI prep failed, trying upload:", e);
      }
    }
  }
  return uploadLocalImageToReplicate(token, imageUri);
}

function buildPredictionInput(
  version: string,
  imageUrl: string,
  staging: GenerateStagedImageParams,
  promptAugmentation: string | undefined
): Record<string, unknown> {
  const mode = staging.designMode ?? "interior";
  const photoMode = staging.photoMode;
  const seed = parseSeed();
  /** Global palette hints can fight an explicit wall hex; drop palette from aug when hex is set. */
  const wallsHexLocksPalette =
    mode === "walls" && Boolean(normalizeWallColorHex(staging.wallColorHex));
  const fluxLeanInterior =
    usesFluxKontextInputSchema(version) &&
    mode === "interior" &&
    !fluxVerboseInteriorPromptEnabled();
  const fluxInjectsPaletteEarly =
    usesFluxKontextInputSchema(version) &&
    (fluxLeanInterior || mode === "exterior");
  /** Lean interior + exterior FLUX inject palette in the main prompt — avoid duplicating at the tail. */
  const finalPromptAugmentation = combinePromptAugmentation(
    promptAugmentation,
    wallsHexLocksPalette || fluxInjectsPaletteEarly ? undefined : staging.paletteId,
    {
      omitPalette: wallsHexLocksPalette || fluxInjectsPaletteEarly,
      designMode: mode,
    }
  );
  if (usesAdirikInputSchema(version)) {
    const inf = getAdirikInferenceDefaults(photoMode);
    let prompt: string;
    let negativePrompt: string;
    if (mode === "walls" && staging.wallTreatment && staging.wallStyle) {
      prompt = buildWallsAdirikPrompt({
        treatment: staging.wallTreatment,
        presetId: staging.wallStyle,
        colorHex: staging.wallColorHex,
        customPrompt: staging.wallCustomPrompt,
        photoMode,
        promptAugmentation: finalPromptAugmentation,
      });
      negativePrompt = buildWallsNegativePrompt(staging.wallTreatment);
    } else if (
      mode === "exterior" &&
      staging.exteriorSceneType &&
      staging.exteriorStyle
    ) {
      prompt = buildExteriorAdirikPrompt(
        staging.exteriorSceneType,
        staging.exteriorStyle,
        finalPromptAugmentation,
        photoMode
      );
      negativePrompt = buildExteriorAdirikNegativePrompt(photoMode);
    } else {
      prompt = buildAdirikPrompt(
        staging.roomType as RoomType,
        staging.style as StyleType,
        finalPromptAugmentation,
        photoMode
      );
      negativePrompt = buildAdirikNegativePrompt(staging.roomType as RoomType, photoMode);
    }
    const input: Record<string, unknown> = {
      image: imageUrl,
      prompt,
      negative_prompt: negativePrompt,
      num_inference_steps: inf.num_inference_steps,
      guidance_scale: inf.guidance_scale,
      prompt_strength: inf.prompt_strength,
    };
    if (seed !== undefined) input.seed = seed;
    return input;
  }
  if (usesFluxKontextInputSchema(version)) {
    let prompt: string;
    if (mode === "walls" && staging.wallTreatment && staging.wallStyle) {
      prompt = buildWallsFluxKontextPrompt({
        treatment: staging.wallTreatment,
        presetId: staging.wallStyle,
        colorHex: staging.wallColorHex,
        customPrompt: staging.wallCustomPrompt,
        photoMode,
        promptAugmentation: finalPromptAugmentation,
      });
    } else if (
      mode === "exterior" &&
      staging.exteriorSceneType &&
      staging.exteriorStyle
    ) {
      prompt = buildExteriorFluxKontextPrompt(
        staging.exteriorSceneType,
        staging.exteriorStyle,
        finalPromptAugmentation,
        photoMode,
        staging.paletteId
      );
    } else {
      prompt = buildFluxKontextPrompt(
        staging.roomType as RoomType,
        staging.style as StyleType,
        finalPromptAugmentation,
        photoMode,
        fluxLeanInterior ? staging.paletteId : undefined
      );
    }
    const input: Record<string, unknown> = {
      prompt,
      input_image: imageUrl,
      aspect_ratio: fluxAspectRatio(),
      output_format: fluxOutputFormat(),
      safety_tolerance: fluxSafetyTolerance(),
      prompt_upsampling: fluxPromptUpsampling(),
    };
    if (seed !== undefined) input.seed = seed;
    return input;
  }
  if (!usesRemodelaInputSchema(version)) {
    throw new Error(
      "Unsupported EXPO_PUBLIC_REPLICATE_MODEL_VERSION. Use black-forest-labs/flux-kontext-pro:…, adirik/interior-design:…, or remodela-ai/virtual_staging_iii:… (copy the full version string from the model API tab on Replicate)."
    );
  }
  const furnished = effectivePhotoMode(photoMode) === "furnished";
  const rm = getRemodelaDynamics(photoMode);
  const extra = finalPromptAugmentation?.trim();

  if (mode === "walls" && staging.wallTreatment && staging.wallStyle) {
    const prompt = buildWallsRemodelaPrompt({
      treatment: staging.wallTreatment,
      presetId: staging.wallStyle,
      colorHex: staging.wallColorHex,
      customPrompt: staging.wallCustomPrompt,
      photoMode,
      promptAugmentation: finalPromptAugmentation,
    });
    // Walls-only refresh needs the model to defer to layout — pick the closest interior bucket.
    const roomBucket = staging.roomType
      ? mapRoomTypeToRemodelaRoom(staging.roomType)
      : "livingRoom";
    return {
      image: imageUrl,
      type_room: roomBucket,
      prompt,
      negative_prompt: buildWallsNegativePrompt(staging.wallTreatment),
      num_inference_steps: rm.num_inference_steps,
      condition_scale: rm.condition_scale,
      seed: seed ?? 0,
    };
  }

  if (mode === "exterior" && staging.exteriorSceneType && staging.exteriorStyle) {
    const styleToken = mapExteriorStyleToRemodelaPrompt(staging.exteriorStyle);
    const rhythm = exteriorProportionClause(staging.exteriorSceneType);
    const density = exteriorDensityClause(staging.exteriorSceneType, photoMode);
    const listingWord = "real-estate";
    let prompt =
      "exterior architecture landscape and hardscape visualization, " +
      `${staging.exteriorSceneType.toLowerCase()}, `;
    prompt += furnished
      ? `full exterior refresh toward cohesive ${styleToken} outdoor design, professional ${listingWord} exterior photo, single coordinated look`
      : `exterior curb appeal and outdoor design, ${styleToken} style, professional ${listingWord} exterior photo`;
    prompt +=
      " preserve roof shape, chimneys, gutters, downspouts, soffits, fascia, every window and door (same count, positions, and mullion patterns—do not mirror or swap gable sides), driveway edges, hardscape boundaries, mature trees, exterior light fixtures, mailbox, and HVAC units";
    prompt += ` ${rhythm} ${density}`;
    if (extra) {
      prompt += ` ${extra.slice(0, 200)}`;
    }
    return {
      image: imageUrl,
      type_room: mapExteriorSceneToRemodelaRoom(staging.exteriorSceneType),
      prompt,
      negative_prompt: buildExteriorRemodelaNegativePrompt(photoMode),
      num_inference_steps: rm.num_inference_steps,
      condition_scale: rm.condition_scale,
      seed: seed ?? 0,
    };
  }

  const roomType = staging.roomType as RoomType;
  const style = staging.style as StyleType;
  const styleToken = mapStyleToRemodelaPrompt(style);
  const rhythm357 = proportionRhythm357Clause(roomType);
  const density = stagingDensityClause(roomType, photoMode);
  const denseEmphasis = denseStyleEmphasis(roomType, style);
  const routing = builtInRoutingClause(roomType);
  const listingWord = roomType === "Restaurant" ? "hospitality" : "real-estate";
  let prompt = remodelaRoomKindPrefix(roomType);
  prompt += furnished
    ? `full restyle: replace or upgrade all visible furniture and decor toward cohesive ${styleToken} virtual staging, professional ${listingWord} photo, single coordinated look`
    : `fully furnished virtual staging, ${styleToken} style, professional ${listingWord} interior photo`;
  prompt +=
    " preserve all walls, the ceiling type (drop tile, coffered, beamed, vaulted, or flat — match exactly), the floor material and tone (no relighting or recoloring), every window and door (same count and positions, mullion grid intact, never walled over by cabinets), outlets, switches, HVAC vents, sprinklers, smoke detectors, and fixed cabinetry positions";
  prompt += ` ${rhythm357} ${density}`;
  if (denseEmphasis) prompt += ` ${denseEmphasis}`;
  if (routing) prompt += ` ${routing}`;
  if (extra) {
    prompt += ` ${extra.slice(0, 200)}`;
  }
  return {
    image: imageUrl,
    type_room: mapRoomTypeToRemodelaRoom(roomType),
    prompt,
    negative_prompt: buildRemodelaNegativePrompt(roomType, photoMode),
    num_inference_steps: rm.num_inference_steps,
    condition_scale: rm.condition_scale,
    seed: seed ?? 0,
  };
}

type PredictionResponse = {
  status: string;
  error?: unknown;
  output?: unknown;
  urls?: { get: string };
};

function normalizeOutput(output: unknown): string {
  if (typeof output === "string") return output;
  if (Array.isArray(output) && typeof output[0] === "string") return output[0];
  throw new Error("Unexpected staging output from API.");
}

async function pollUntilDone(
  token: string,
  getUrl: string
): Promise<unknown> {
  const maxAttempts = 90;
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetchWithTimeout(
      getUrl,
      {
        headers: { Authorization: `Token ${token}` },
      },
      20000,
      "Replicate polling timed out."
    );
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Replicate poll ${res.status}: ${t}`);
    }
    const data = (await res.json()) as PredictionResponse;
    if (data.status === "succeeded") return data.output;
    if (data.status === "failed" || data.status === "canceled") {
      const err =
        typeof data.error === "string"
          ? data.error
          : JSON.stringify(data.error ?? "Prediction failed");
      throw new Error(err);
    }
    await sleep(2000);
  }
  throw new Error("Staging timed out. Try again with a smaller image.");
}

async function runReplicateStaging(
  token: string,
  imageInputUrl: string,
  staging: GenerateStagedImageParams,
  promptAugmentation: string | undefined
): Promise<string> {
  const version =
    getEnv("EXPO_PUBLIC_REPLICATE_MODEL_VERSION")?.trim() ||
    DEFAULT_STAGING_MODEL_VERSION;

  const input = buildPredictionInput(
    version,
    imageInputUrl,
    staging,
    promptAugmentation
  );

  const createRes = await fetchWithTimeout(
    REPLICATE_PREDICTIONS,
    {
      method: "POST",
      headers: {
        Authorization: `Token ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ version, input }),
    },
    30000,
    "Replicate prediction request timed out."
  );

  const raw = await createRes.text();
  if (!createRes.ok) {
    throw new Error(`Replicate ${createRes.status}: ${raw}`);
  }

  const pred = JSON.parse(raw) as PredictionResponse;
  if (pred.status === "succeeded" && pred.output != null) {
    return normalizeOutput(pred.output);
  }
  const getUrl = pred.urls?.get;
  if (!getUrl) {
    throw new Error("Replicate response missing prediction URL.");
  }
  const output = await pollUntilDone(token, getUrl);
  return normalizeOutput(output);
}

/** Maps low-level fetch / OS errors into a short title + body for `Alert.alert`. */
export function formatStagingError(
  err: unknown,
  languageId: LanguageId
): {
  title: string;
  message: string;
} {
  const raw =
    err instanceof Error ? err.message : String(err ?? "Something went wrong.");
  const lower = raw.toLowerCase();
  const isRnFetchFailure =
    lower.includes("network request failed") ||
    (err instanceof TypeError && lower.includes("network"));
  if (isRnFetchFailure && Platform.OS === "ios") {
    return {
      title: translate(languageId, "error.stagingIosFetchTitle"),
      message: translate(languageId, "error.stagingIosFetchBody"),
    };
  }
  if (
    lower.includes("unable to resolve host") ||
    lower.includes("no address associated with hostname") ||
    lower.includes("network request failed") ||
    lower.includes("failed to connect") ||
    lower.includes("could not connect") ||
    lower.includes("connection refused") ||
    lower.includes("connection timed out") ||
    lower.includes("timed out") ||
    lower.includes("getaddrinfo") ||
    lower.includes("enotfound") ||
    lower.includes("econnrefused") ||
    lower.includes("etimedout") ||
    lower.includes("unknownhostexception") ||
    lower.includes("cleartext not permitted")
  ) {
    return {
      title: translate(languageId, "error.stagingNetworkTitle"),
      message: translate(languageId, "error.stagingNetworkBody"),
    };
  }
  if (raw.includes("401") || lower.includes("unauthorized")) {
    return {
      title: translate(languageId, "error.staging401Title"),
      message: translate(languageId, "error.staging401Body"),
    };
  }
  if (isPhotoFormatError(err)) {
    return {
      title: translate(languageId, "error.stagingPhotoFormatTitle"),
      message: translate(languageId, "error.stagingPhotoFormatBody"),
    };
  }
  if (raw.includes("STAGING_CONFIG_MISSING")) {
    return {
      title: translate(languageId, "error.stagingConfigTitle"),
      message: translate(languageId, "error.stagingConfigBody"),
    };
  }
  return {
    title: translate(languageId, "error.stagingGenericTitle"),
    message: translate(languageId, "error.stagingGenericBody"),
  };
}

/**
 * Virtual staging: optional Gemini phrase, then Replicate (`EXPO_PUBLIC_REPLICATE_MODEL_VERSION`).
 * Supports FLUX.1 Kontext [pro] (text + `input_image` edit), adirik (img2img interior), or remodela.
 */
export async function generateStagedImage(
  params: GenerateStagedImageParams
): Promise<string> {
  const mode = params.designMode ?? "interior";
  if (mode === "exterior") {
    if (!params.exteriorSceneType || !params.exteriorStyle) {
      throw new Error(
        "Exterior staging requires exteriorSceneType and exteriorStyle."
      );
    }
  } else if (mode === "walls") {
    if (!params.wallTreatment || !params.wallStyle) {
      throw new Error("Walls refresh requires wallTreatment and wallStyle.");
    }
  } else if (!params.roomType || !params.style) {
    throw new Error("Interior staging requires roomType and style.");
  }

  const { imageUri, photoMode } = params;
  const useMock = getEnv("EXPO_PUBLIC_STAGING_MOCK") === "1";
  const token = getEnv("EXPO_PUBLIC_REPLICATE_API_TOKEN")?.trim();

  if (useMock) {
    await sleep(2000 + Math.random() * 1000);
    return MOCK_PLACEHOLDER_URL;
  }

  if (!token) {
    throw new Error(
      "STAGING_CONFIG_MISSING: Add EXPO_PUBLIC_REPLICATE_API_TOKEN to .env in the project root, then rebuild in Xcode (Product → Clean Build Folder, then Run). " +
      "Or set EXPO_PUBLIC_STAGING_MOCK=1 only for a demo that ignores your photo."
    );
  }

  const promptAugmentation = await tryAugmentStagingPrompt(params);

  console.warn("[HomeAI] staging: uploading photo to Replicate…");
  const imageInputUrl = await withTimeout(
    resolveImageInputUrl(token, imageUri),
    120_000,
    "Uploading your photo timed out. Check your connection and try again."
  );

  console.warn("[HomeAI] staging: running Replicate model…");
  return runReplicateStaging(token, imageInputUrl, params, promptAugmentation);
}
