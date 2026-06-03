/**
 * Curated staging color directions: shown as 5-bar swatches in Configure;
 * `stagingHint` is appended to model prompts (English) alongside interior style.
 */
export const STAGING_PALETTES = [
  {
    id: "surprise_me",
    surprise: true,
    colors: ["#FF6B6B", "#FBBF24", "#34D399", "#60A5FA", "#A78BFA"] as const,
    stagingHint:
      "Let upholstery, rug, and art colors emerge naturally from the style—fresh, cohesive, listing-ready accents without a fixed swatch constraint.",
  },
  {
    id: "millennial_gray",
    colors: ["#F3F4F6", "#D1D5DB", "#9CA3AF", "#6B7280", "#374151"] as const,
    stagingHint:
      "Lean into cool-to-warm grays and soft greige—matte metals, linen, and tonal layering; avoid muddy brown mixes.",
  },
  {
    id: "terracotta_mirage",
    colors: ["#FFF7ED", "#FDBA74", "#EA580C", "#C2410C", "#7C2D12"] as const,
    stagingHint:
      "Warm peach-to-terracotta story with cream neutrals—clay, sun-warmed plaster feeling, matte ceramics.",
  },
  {
    id: "neon_sunset",
    colors: ["#F97316", "#EC4899", "#A855F7", "#FACC15", "#FECDD3"] as const,
    stagingHint:
      "High-energy sunset accents—vivid magenta, orange, violet, and lemon—balanced with repeated neutrals so it stays adult and photoreal.",
  },
  {
    id: "forest_hues",
    colors: ["#D1FAE5", "#6EE7B7", "#34D399", "#059669", "#14532D"] as const,
    stagingHint:
      "Muted sage through deep forest green—natural wood, matte black or brass touches, restrained botanical depth.",
  },
  {
    id: "peach_orchard",
    colors: ["#FFFBEB", "#FDE68A", "#FBCFE8", "#FDA4AF", "#FB7185"] as const,
    stagingHint:
      "Soft peach, blush, and warm cream—airy pastels with gentle contrast, powder-coated metals or pale oak.",
  },
  {
    id: "fuchsia_blossom",
    colors: ["#FDF2F8", "#FBCFE8", "#F472B6", "#DB2777", "#9D174D"] as const,
    stagingHint:
      "Pink-to-fuchsia gradient on walls or accents—pair with warm white and one deep anchor tone so it reads luxe, not candy.",
  },
  {
    id: "emerald_gem",
    colors: ["#ECFDF5", "#86EFAC", "#22C55E", "#15803D", "#422006"] as const,
    stagingHint:
      "Emerald and deep forest with sage highlights and warm beige neutrals—stone or wood balance, low-sheen finishes.",
  },
  {
    id: "pastel_breeze",
    colors: ["#EFF6FF", "#FEF9C3", "#D1FAE5", "#E9D5FF", "#FCE7F3"] as const,
    stagingHint:
      "Very light desaturated pastels—sky blue, butter yellow, mint, lavender—airy negative space and soft textures.",
  },
  {
    id: "azure_mirage",
    colors: ["#0EA5E9", "#67E8F9", "#A5F3FC", "#FFFBEB", "#D6D3D1"] as const,
    stagingHint:
      "Bright aqua and sky blue with mint and warm sand—coastal-modern clarity without nautical kitsch.",
  },
  {
    id: "twilight_blues",
    colors: ["#0F172A", "#334155", "#F8FAFC", "#D6D3D1", "#94A3B8"] as const,
    stagingHint:
      "Deep navy and slate with crisp white and warm tan—moody evening calm, matte surfaces, subtle metallic glints.",
  },
  {
    id: "earthy_harmony",
    colors: ["#431407", "#92400E", "#B45309", "#D6D3D1", "#FFFBEB"] as const,
    stagingHint:
      "Chocolate through caramel to cream—layered earth tones, woven textiles, stone or clay accents.",
  },
  {
    id: "arctic_lavender",
    colors: ["#E2E8F0", "#64748B", "#FFFFFF", "#E9D5FF", "#BAE6FD"] as const,
    stagingHint:
      "Cool blue-gray steel with pale lavender and ice blue—serene, Nordic-cool restraint.",
  },
  {
    id: "antique_sage",
    colors: ["#78716C", "#84CC16", "#A3A3A3", "#D6D3D1", "#ECFCCB"] as const,
    stagingHint:
      "Muted olive and sage with warm greige and linen—aged brass or oil-rubbed bronze sparingly.",
  },
  {
    id: "earthy_hues",
    colors: ["#57534E", "#A8A29E", "#78716C", "#44403C", "#FAFAF9"] as const,
    stagingHint:
      "Mocha, tan, and muted green-brown—organic materials, low-contrast layering, tactile rugs.",
  },
  {
    id: "velvet_dusk",
    colors: ["#422006", "#9F1239", "#A78BFA", "#E7E5E4", "#FAFAF9"] as const,
    stagingHint:
      "Dusty rose, mauve, and chocolate with soft ivory—velvet or matte velveteen feeling, dimmable warm light.",
  },
  {
    id: "ocean_mist",
    colors: ["#1E3A5F", "#475569", "#93C5FD", "#FEF3C7", "#E2E8F0"] as const,
    stagingHint:
      "Slate to steel blue into misty sky and cream—quiet coastal depth without changing window views.",
  },
  {
    id: "amethyst_dream",
    colors: ["#F5F3FF", "#DDD6FE", "#A78BFA", "#7C3AED", "#4C1D95"] as const,
    stagingHint:
      "Lavender through rich violet—monochrome purple story with white breathing room and matte black accents.",
  },
  {
    id: "sakura_bloom",
    colors: ["#FFF1F2", "#FECDD3", "#FB7185", "#F43F5E", "#BE123C"] as const,
    stagingHint:
      "Pale sakura pink building to vivid rose—monochrome pink path with warm white trims.",
  },
  {
    id: "lilac_love",
    colors: ["#FAF5FF", "#E9D5FF", "#C4B5FD", "#8B5CF6", "#6D28D9"] as const,
    stagingHint:
      "Soft lilac and wisteria tones—lighter than amethyst, romantic but tidy and listing-safe.",
  },
  {
    id: "whimsical_wish",
    colors: ["#F5F5F4", "#D6D3D1", "#44403C", "#57534E", "#A8A29E"] as const,
    stagingHint:
      "Warm beige, tan, and chocolate with a muted plum-brown accent—cozy eclectic without rainbow clutter.",
  },
  {
    id: "turquoise_lagoon",
    colors: ["#CCFBF1", "#2DD4BF", "#14B8A6", "#0F766E", "#134E4A"] as const,
    stagingHint:
      "Teal-to-turquoise monochrome—glass, stone, and matte green-blue cabinetry or accents where believable.",
  },
] as const;

export type StagingPaletteId = (typeof STAGING_PALETTES)[number]["id"];

export const DEFAULT_STAGING_PALETTE_ID: StagingPaletteId = "surprise_me";

export function getStagingPaletteHint(id: StagingPaletteId): string {
  const entry = STAGING_PALETTES.find((p) => p.id === id);
  return entry?.stagingHint ?? STAGING_PALETTES[0].stagingHint;
}

export function isSurprisePalette(id: StagingPaletteId): boolean {
  return id === "surprise_me";
}
