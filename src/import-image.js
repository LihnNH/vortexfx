const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

export function normalizePixels(data, width, height, requireTransparency) {
  let transparent = false, minX = width, minY = height, maxX = -1, maxY = -1;
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha < 255) transparent = true;
    if (alpha > 0) {
      const index = i / 4, x = index % width, y = Math.floor(index / width);
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
    data[i] = data[i + 1] = data[i + 2] = 0;
  }
  if (requireTransparency && !transparent) throw new Error('Este PNG tem fundo opaco. Importe um PNG com transparência.');
  if (maxX < 0) throw new Error('A imagem está completamente transparente e não contém conteúdo visível.');
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function localURLs(value) {
  return value.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (match, quote, url) => url.trim().startsWith('#') ? match : 'none');
}

function sanitizeSVG(text) {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const root = doc.documentElement;
  if (doc.querySelector('parsererror') || root.localName !== 'svg' || root.namespaceURI !== 'http://www.w3.org/2000/svg') {
    throw new Error('Este arquivo SVG não é válido.');
  }
  root.querySelectorAll('script, foreignObject, animate, animateTransform, animateMotion, set').forEach(node => node.remove());
  for (const element of [root, ...root.querySelectorAll('*')]) {
    for (const attribute of [...element.attributes]) {
      if (/^on/i.test(attribute.name)) element.removeAttribute(attribute.name);
      if (attribute.name === 'xml:base') element.removeAttribute(attribute.name);
      if (/^(href|xlink:href)$/i.test(attribute.name) && !/^(#|data:image\/(png|jpeg|webp);base64,)/i.test(attribute.value.trim())) element.removeAttribute(attribute.name);
      if (/url\(/i.test(attribute.value)) element.setAttribute(attribute.name, localURLs(attribute.value));
    }
  }
  root.querySelectorAll('style').forEach(node => {
    node.textContent = localURLs(node.textContent.replace(/@import[^;]*;/gi, ''));
  });
  const viewBox = root.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
  if (viewBox?.length === 4 && viewBox.every(Number.isFinite) && viewBox[2] > 0 && viewBox[3] > 0) {
    if (!/^\d+(\.\d+)?(px)?$/.test(root.getAttribute('width') || '')) root.setAttribute('width', String(viewBox[2]));
    if (!/^\d+(\.\d+)?(px)?$/.test(root.getAttribute('height') || '')) root.setAttribute('height', String(viewBox[3]));
  }
  return new XMLSerializer().serializeToString(root);
}

export async function importImage(file) {
  const extension = file.name.split('.').pop().toLowerCase();
  if (!['png', 'svg'].includes(extension)) throw new Error('Use apenas PNG com fundo transparente ou SVG.');
  let blob = file;
  if (extension === 'png') {
    const signature = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    if (!PNG_SIGNATURE.every((byte, index) => signature[index] === byte)) throw new Error('Este arquivo não é um PNG válido.');
  } else {
    blob = new Blob([sanitizeSVG(await file.text())], { type: 'image/svg+xml' });
  }
  const url = URL.createObjectURL(blob);
  const image = new Image();
  try {
    image.src = url;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('A imagem não tem dimensões válidas.');
    const scale = Math.min(1, 4096 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    // Ignore every source color; retain alpha, including antialiased edges.
    const bounds = normalizePixels(pixels.data, canvas.width, canvas.height, extension === 'png');
    ctx.putImageData(pixels, 0, 0);
    const mask = document.createElement('canvas');
    mask.width = bounds.width; mask.height = bounds.height;
    mask.getContext('2d').drawImage(canvas, bounds.x, bounds.y, mask.width, mask.height, 0, 0, mask.width, mask.height);
    return { canvas: mask, name: file.name };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'EncodingError') throw new Error('Não foi possível ler a imagem. Confira se o arquivo está válido.');
    throw error;
  } finally { URL.revokeObjectURL(url); }
}
