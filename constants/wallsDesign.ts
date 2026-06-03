/**
 * Walls staging taxonomy: treatments (paint, wallpaper, paneling, tile, mural, custom)
 * and curated preset styles per treatment. Used by Configure flow + prompt builders.
 */

export const WALL_TREATMENT_TYPES = [
  "Paint",
  "Accent Wall",
  "Wallpaper",
  "Wood Paneling",
  "Tile",
  "Mural",
  "Custom",
] as const;

export type WallTreatmentType = (typeof WALL_TREATMENT_TYPES)[number];

/**
 * Wall style preset identifiers. Each preset is scoped to a treatment (see
 * `WALL_PRESET_TREATMENT`) and carries one short `promptHint` so the model
 * stays on a specific look without inventing other materials.
 */
export const WALL_STYLE_PRESETS = [
  // Paint — uniform wall color across the room
  {
    id: "paint_classic_white",
    treatment: "Paint" as const,
    swatch: "#F4F1EB",
    promptHint:
      "Repaint all wall surfaces a soft warm white (off-white, like a designer warm white)—matte finish, even sheen, no brush strokes; keep trim, ceiling, floor, and windows untouched.",
  },
  {
    id: "paint_warm_greige",
    treatment: "Paint" as const,
    swatch: "#C9BFAF",
    promptHint:
      "Repaint walls in a warm greige (taupe-leaning beige-gray)—matte finish, calm and listing-ready; trim and ceiling stay neutral white, no glare.",
  },
  {
    id: "paint_cool_gray",
    treatment: "Paint" as const,
    swatch: "#B8BEC4",
    promptHint:
      "Repaint walls in a cool putty gray—matte, neutral, no blue cast on white trim; ceiling, floor, fixtures unchanged.",
  },
  {
    id: "paint_sage",
    treatment: "Paint" as const,
    swatch: "#9CAA8E",
    promptHint:
      "Repaint walls in a muted sage green (gentle, herbal, slightly gray-green)—matte finish; preserve trim, ceiling, floor, windows.",
  },
  {
    id: "paint_navy",
    treatment: "Paint" as const,
    swatch: "#1F3147",
    promptHint:
      "Repaint walls in a deep moody navy (indigo-blue, slight depth)—matte or eggshell finish; trim stays clean white, no color bleed to ceiling.",
  },
  {
    id: "paint_terracotta",
    treatment: "Paint" as const,
    swatch: "#B6644A",
    promptHint:
      "Repaint walls in a warm terracotta (sun-warmed clay, slightly orange-red)—matte finish; trim and ceiling stay neutral, no garish saturation.",
  },
  {
    id: "paint_blush",
    treatment: "Paint" as const,
    swatch: "#E4C0BD",
    promptHint:
      "Repaint walls in a soft blush pink (dusty, warm, not candy)—matte finish; trim and ceiling neutral white, calm and airy.",
  },
  {
    id: "paint_charcoal",
    treatment: "Paint" as const,
    swatch: "#36383C",
    promptHint:
      "Repaint walls in deep charcoal (near-black with warm undertone)—matte finish; trim stays crisp, ceiling neutral, no scuffs.",
  },

  // Accent Wall — single feature wall behind the focal point
  {
    id: "accent_deep_navy",
    treatment: "Accent Wall" as const,
    swatch: "#1F3147",
    promptHint:
      "Paint exactly ONE feature wall behind the room's focal point (sofa, bed headboard, or media unit) in deep navy blue—matte finish; other walls stay their existing color; trim, ceiling, floor unchanged.",
  },
  {
    id: "accent_burnt_terracotta",
    treatment: "Accent Wall" as const,
    swatch: "#A85839",
    promptHint:
      "Paint exactly ONE feature wall behind the focal point in burnt terracotta—matte; remaining walls stay as-is; ceiling and trim unchanged.",
  },
  {
    id: "accent_forest_green",
    treatment: "Accent Wall" as const,
    swatch: "#365940",
    promptHint:
      "Paint exactly ONE feature wall behind the focal point in deep forest green—matte finish; other walls untouched.",
  },
  {
    id: "accent_charcoal",
    treatment: "Accent Wall" as const,
    swatch: "#2C2D31",
    promptHint:
      "Paint exactly ONE feature wall behind the focal point in soft charcoal black—matte; trim sharp, other walls stay original tone.",
  },
  {
    id: "accent_blush",
    treatment: "Accent Wall" as const,
    swatch: "#D6A6A0",
    promptHint:
      "Paint exactly ONE feature wall behind the focal point in dusty blush rose—matte; remaining walls keep their current finish.",
  },
  {
    id: "accent_mustard",
    treatment: "Accent Wall" as const,
    swatch: "#B98A36",
    promptHint:
      "Paint exactly ONE feature wall behind the focal point in muted mustard ochre—matte; rest of room neutral.",
  },

  // Wallpaper — repeating pattern across walls
  {
    id: "wallpaper_botanical",
    treatment: "Wallpaper" as const,
    swatch: "#7C8C6F",
    promptHint:
      "Cover walls with a refined botanical leaf wallpaper—sage and cream, large-scale repeating fronds, matte paper finish; pattern aligns vertically, seams invisible, no warping.",
  },
  {
    id: "wallpaper_geometric",
    treatment: "Wallpaper" as const,
    swatch: "#3C4655",
    promptHint:
      "Cover walls with a small-scale modern geometric wallpaper—deep navy on cream, crisp print; pattern repeats cleanly without distortion or stretched seams.",
  },
  {
    id: "wallpaper_floral_vintage",
    treatment: "Wallpaper" as const,
    swatch: "#C76A6A",
    promptHint:
      "Cover walls with a vintage floral wallpaper (cottagecore feel)—soft rose, sage, and cream blooms on light ground; matte paper, photoreal seams.",
  },
  {
    id: "wallpaper_grasscloth",
    treatment: "Wallpaper" as const,
    swatch: "#C2A57E",
    promptHint:
      "Cover walls with a natural grasscloth wallpaper—warm sand-tan tone, visible woven fiber texture, matte, calm and tactile; clean horizontal seams.",
  },
  {
    id: "wallpaper_damask",
    treatment: "Wallpaper" as const,
    swatch: "#5A4A6D",
    promptHint:
      "Cover walls with a classic damask wallpaper—muted plum motif on warm cream ground, traditional repeat; matte finish, no shine.",
  },
  {
    id: "wallpaper_chinoiserie_blue",
    treatment: "Wallpaper" as const,
    swatch: "#3B6C92",
    promptHint:
      "Cover walls with hand-painted chinoiserie wallpaper—pale blue ground, delicate cranes, branches and blossoms in soft tan; light matte finish.",
  },

  // Wood Paneling / Wainscoting / Board & Batten
  {
    id: "paneling_shaker_painted",
    treatment: "Wood Paneling" as const,
    swatch: "#EFEAE0",
    promptHint:
      "Apply shaker-style painted wainscoting on the lower third of every wall—warm white panels with thin rails and stiles, matte finish; upper wall stays a neutral painted color.",
  },
  {
    id: "paneling_shiplap",
    treatment: "Wood Paneling" as const,
    swatch: "#F0EBE1",
    promptHint:
      "Cover walls in horizontal shiplap planks painted warm white—even reveal, matte finish; subtle plank shadow lines, no warping; trim and ceiling unchanged.",
  },
  {
    id: "paneling_board_batten",
    treatment: "Wood Paneling" as const,
    swatch: "#1F2A30",
    promptHint:
      "Apply vertical board-and-batten paneling on the lower two-thirds of walls in deep moody navy—matte; battens evenly spaced; upper wall painted warm white.",
  },
  {
    id: "paneling_warm_oak",
    treatment: "Wood Paneling" as const,
    swatch: "#B58F5E",
    promptHint:
      "Cover walls with full-height warm white oak paneling—vertical reeded grooves, matte natural finish; visible wood grain, photoreal joinery.",
  },
  {
    id: "paneling_walnut",
    treatment: "Wood Paneling" as const,
    swatch: "#5B3A23",
    promptHint:
      "Cover walls with rich walnut wood paneling—flat panels with thin reveal lines, satin finish; deep chocolate tone with visible grain, no fake plastic sheen.",
  },

  // Tile / Stone
  {
    id: "tile_subway_white",
    treatment: "Tile" as const,
    swatch: "#F4F2EE",
    promptHint:
      "Tile walls in classic 3x6 white subway tile with thin light-gray grout—glossy ceramic finish; running-bond layout; clean grout lines, no warping.",
  },
  {
    id: "tile_zellige_handmade",
    treatment: "Tile" as const,
    swatch: "#9FBBC0",
    promptHint:
      "Tile walls in handmade glazed zellige in soft sea blue—4x4 squares, slight tonal variation, glossy uneven surface, narrow matched grout; photoreal artisan finish.",
  },
  {
    id: "tile_marble_slab",
    treatment: "Tile" as const,
    swatch: "#E8E6E1",
    promptHint:
      "Clad walls in large book-matched marble slabs—warm white with subtle gray veining, polished finish; minimal seams aligned crisply.",
  },
  {
    id: "tile_terrazzo",
    treatment: "Tile" as const,
    swatch: "#D7CDBE",
    promptHint:
      "Clad walls in a soft terrazzo panel—warm cream ground with small earth-tone chips (rust, charcoal, sage); matte finish, large continuous sheets, no busy seams.",
  },
  {
    id: "tile_brick_white",
    treatment: "Tile" as const,
    swatch: "#E4DCD0",
    promptHint:
      "Cover walls in painted white-washed brick—warm off-white with subtle texture variation, light gray mortar; matte finish, photoreal masonry.",
  },

  // Mural / Feature wall art
  {
    id: "mural_landscape",
    treatment: "Mural" as const,
    swatch: "#7E8E92",
    promptHint:
      "Apply a soft landscape mural to ONE feature wall—watercolor mountains and mist in muted sage and grey; rest of walls neutral painted; mural reads as wallpaper, not a window or photo.",
  },
  {
    id: "mural_botanical_gardenscape",
    treatment: "Mural" as const,
    swatch: "#7A916C",
    promptHint:
      "Apply a hand-painted botanical gardenscape mural to ONE feature wall—lush greenery, cranes or tropical leaves on a warm cream ground; remaining walls stay neutral.",
  },
  {
    id: "mural_abstract_organic",
    treatment: "Mural" as const,
    swatch: "#C29A6F",
    promptHint:
      "Apply a large-scale abstract organic mural to ONE feature wall—earthy curves and shapes in terracotta, sand, and cream; matte finish; rest of walls stay simple.",
  },

  // Custom — user provides their own prompt; we keep a generic anchor.
  {
    id: "custom_paint_color",
    treatment: "Custom" as const,
    swatch: "#6E7D85",
    promptHint:
      "Apply the user-provided wall finish exactly as described—respect any color or material they specify; keep the look believable and photoreal, no exaggerated theme cues.",
  },
] as const;

export type WallStylePresetId = (typeof WALL_STYLE_PRESETS)[number]["id"];

export const DEFAULT_WALL_TREATMENT: WallTreatmentType = "Paint";

/** Quick lookup from preset id → treatment. */
export function wallTreatmentForPreset(id: WallStylePresetId): WallTreatmentType {
  const entry = WALL_STYLE_PRESETS.find((p) => p.id === id);
  return entry?.treatment ?? DEFAULT_WALL_TREATMENT;
}

/** Style presets filtered by treatment, in the order Configure should show them. */
export function wallPresetsForTreatment(treatment: WallTreatmentType) {
  return WALL_STYLE_PRESETS.filter((p) => p.treatment === treatment);
}

export function getWallPresetHint(id: WallStylePresetId): string {
  const entry = WALL_STYLE_PRESETS.find((p) => p.id === id);
  return entry?.promptHint ?? "";
}

export function getWallPresetSwatch(id: WallStylePresetId): string {
  const entry = WALL_STYLE_PRESETS.find((p) => p.id === id);
  return entry?.swatch ?? "#CCCCCC";
}

/** Default preset for each treatment — used when user switches treatment chips. */
export function defaultWallPresetForTreatment(
  treatment: WallTreatmentType
): WallStylePresetId {
  const first = wallPresetsForTreatment(treatment)[0];
  return (first?.id ?? "paint_classic_white") as WallStylePresetId;
}

/** Normalize a #RRGGBB hex; returns undefined when input is empty/invalid. */
export function normalizeWallColorHex(input: string | undefined): string | undefined {
  if (!input) return undefined;
  const cleaned = input.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) return undefined;
  return `#${cleaned.toUpperCase()}`;
}

/**
 * Quick-pick wall colors shown above the custom hex input. The first entry is
 * the "Custom" tile (rainbow swatch) that focuses the hex field for arbitrary
 * picks. All other tiles bind to a fixed hex.
 *
 * Order mirrors the 3×6 layout: neutrals → warm yellows/greens → mints/blues →
 * lavender/pinks. Hex values are tuned to read well as paint at scale.
 */
export const WALL_QUICK_COLORS = [
  { id: "custom", hex: null },
  { id: "black", hex: "#1B1B1B" },
  { id: "white", hex: "#FFFFFF" },
  { id: "cream", hex: "#FFE17E" },
  { id: "yellow", hex: "#E6E04E" },
  { id: "lime", hex: "#B7E257" },
  { id: "lightMint", hex: "#A8E76C" },
  { id: "mint", hex: "#6FD99B" },
  { id: "brightMint", hex: "#4BD7C0" },
  { id: "cyan", hex: "#5FD6E8" },
  { id: "lightBlue", hex: "#6CBAEC" },
  { id: "sky", hex: "#6798E0" },
  { id: "periwinkle", hex: "#6F7BDD" },
  { id: "lavender", hex: "#B186DF" },
  { id: "magenta", hex: "#DD79DD" },
  { id: "coral", hex: "#E96D6D" },
  { id: "salmon", hex: "#F08B7F" },
  { id: "peach", hex: "#F5A8A5" },
] as const;

export type WallQuickColorId = (typeof WALL_QUICK_COLORS)[number]["id"];

/** Find the quick-color id whose hex matches `normalizedHex` (case-insensitive). */
export function wallQuickColorIdForHex(
  normalizedHex: string | undefined
): WallQuickColorId | undefined {
  if (!normalizedHex) return undefined;
  const up = normalizedHex.toUpperCase();
  const hit = WALL_QUICK_COLORS.find((c) => c.hex && c.hex.toUpperCase() === up);
  return hit?.id;
}
