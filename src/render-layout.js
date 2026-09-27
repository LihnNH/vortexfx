// Artwork and effects share one logical scale, independent of viewport shape.
export const REFERENCE_SIZE = Object.freeze({ width: 990, height: 550 });
export const REFERENCE_FONT_SIZE = REFERENCE_SIZE.height * .72;

export function getTextLayout(width, height, referenceInkWidth) {
  const fontSize = Math.max(.001, Math.min(
    height * .72,
    width * .47,
    width * .86 * REFERENCE_FONT_SIZE / Math.max(referenceInkWidth, 1),
  ));
  return { fontSize, effectScale: fontSize / REFERENCE_FONT_SIZE };
}

export function getImageLayout(width, height, imageWidth, imageHeight) {
  const fit = Math.min(width * .84 / imageWidth, height * .72 / imageHeight);
  const artworkWidth = imageWidth * fit, artworkHeight = imageHeight * fit;
  return {
    width: artworkWidth,
    height: artworkHeight,
    effectScale: Math.max(.001, artworkHeight) / REFERENCE_FONT_SIZE,
  };
}
