export const DEFAULT_CONTROLS = Object.freeze({ effect: 81, strength: 67, spacing: 54, bloom: 48, speed: 100 });

// Keep the original shader's float values instead of rounding them to hex.
export const DEFAULT_COLORS = Object.freeze({
  background: Object.freeze([.902, .867, .858]),
  text: Object.freeze([.024, .015, .017]),
  glowInner: Object.freeze([.66, .065, .78]),
  glowOuter: Object.freeze([.94, .80, .61]),
  thin: Object.freeze([.20, .065, .028]),
});

export const DARK_PRESET = Object.freeze({
  controls: Object.freeze({ effect: 81, strength: 67, spacing: 54, bloom: 6, speed: 100 }),
  colors: Object.freeze({
    background: Object.freeze([0, 0, 0]),
    text: Object.freeze([1, 1, 1]),
    glowInner: Object.freeze([1, 1, 1]),
    glowOuter: Object.freeze([1, 1, 1]),
    thin: Object.freeze([148 / 255, 148 / 255, 148 / 255]),
  }),
});

export function colorToHex(color) {
  return '#' + color.map(channel => Math.round(channel * 255).toString(16).padStart(2, '0')).join('');
}

export function hexToColor(hex) {
  return [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255);
}
