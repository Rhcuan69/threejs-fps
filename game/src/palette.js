// The look plan, in one place. Six values and one accent hue; the lighting makes every
// shade the game needs, so no other colour appears in the code. The same names are the
// CSS custom properties in index.html. Team colours are the two extras.
export const PALETTE = {
  canvas: '#2b2f36',
  surface: '#3d434c',
  hairline: '#525863',
  ink: '#ece8de',
  muted: '#9aa0a8',
  accent: '#f0a830',
  cobalt: '#4a90d9',
  ember: '#e07038',
};

export function shade(name) {
  return PALETTE[name];
}
