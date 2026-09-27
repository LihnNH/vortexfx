import '@fontsource-variable/inter';

export const fallbackFont = { id: 'builtin:inter', name: 'Inter', family: 'Inter Variable', builtin: true, ui: false };
const loaded = new Map();
export function loadFont(font) {
  if (!font) return loadFont(fallbackFont);
  if (!loaded.has(font.id)) {
    const loading = (font.builtin ? document.fonts.load('400 24px "Inter Variable"').then(() => font.family) : new FontFace(font.family, `url("${font.url}")`).load().then(face => {
      document.fonts.add(face);
      return face.family;
    })).catch(error => { loaded.delete(font.id); throw error; });
    loaded.set(font.id, loading);
  }
  return loaded.get(font.id);
}

export async function loadFontWithFallback(font = fallbackFont) {
  try { return { font, family: await loadFont(font) }; }
  catch (error) {
    if (font.builtin) throw error;
    return { font: fallbackFont, family: await loadFont(fallbackFont) };
  }
}

export async function loadInterfaceFont(fonts) {
  const candidates = fonts.filter(font => font.ui);
  const font = candidates.find(font => /regular/i.test(font.id)) || candidates[0] || fallbackFont;
  const family = await loadFont(font).catch(() => loadFont(fallbackFont));
  document.documentElement.style.setProperty('--interface-font', `"${family}"`);
}
