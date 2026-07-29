export type ColorPaletteId =
  | "blue"
  | "sage"
  | "terracotta"
  | "ocean"

export interface ColorPalette {
  id: ColorPaletteId
  name: string
  description: string
  swatches: [string, string, string, string, string]
}

export const COLOR_PALETTE_STORAGE_KEY = "vocablab_color_palette"

export const COLOR_PALETTES: ColorPalette[] = [
  {
    id: "blue",
    name: "Azul",
    description: "Estilo glass moderno com alto contraste",
    swatches: ["#0E1722", "#1A3045", "#267EDC", "#8DC7FF", "#DFECF8"],
  },
  {
    id: "sage",
    name: "Sálvia",
    description: "Verde natural, calmo e equilibrado",
    swatches: ["#183226", "#4F745D", "#78A386", "#C7DACB", "#F1F7F2"],
  },
  {
    id: "terracotta",
    name: "Terracota",
    description: "Quente, expressivo e acolhedor",
    swatches: ["#38201B", "#7D4435", "#C4694F", "#E9B7A7", "#FBF1ED"],
  },
  {
    id: "ocean",
    name: "Oceano",
    description: "Azul-petróleo fresco e profundo",
    swatches: ["#123138", "#286875", "#3194A5", "#A8D6DB", "#EDF8F9"],
  },
]

export const DEFAULT_COLOR_PALETTE: ColorPaletteId = "blue"

export const COLOR_PALETTE_CLASS_PREFIX = "palette-"

export function isColorPaletteId(value: string): value is ColorPaletteId {
  return COLOR_PALETTES.some((palette) => palette.id === value)
}

export function getColorPaletteClass(paletteId: ColorPaletteId): string {
  return `${COLOR_PALETTE_CLASS_PREFIX}${paletteId}`
}
