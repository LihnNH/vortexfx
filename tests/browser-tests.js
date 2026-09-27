import { importImage } from '../src/import-image.js';
import { createRenderer } from '../src/renderer.js';

const results = document.querySelector('#results');
let passed = 0, failed = 0;
function assert(condition, message) { if (!condition) throw new Error(message); }
async function check(label, test) {
  const row = document.createElement('li');
  try { await test(); passed++; row.textContent = `PASS — ${label}`; }
  catch (error) { failed++; row.textContent = `FAIL — ${label}: ${error.message}`; row.style.color = '#a00000'; }
  results.append(row);
}
async function pngFile(draw, name = 'fixture.png') {
  const canvas = document.createElement('canvas'); canvas.width = 48; canvas.height = 32;
  draw(canvas.getContext('2d'));
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  return new File([blob], name, { type: 'image/png' });
}
function assertBlack(mask) {
  const data = mask.canvas.getContext('2d').getImageData(0, 0, mask.canvas.width, mask.canvas.height).data;
  let visible = 0;
  for (let i = 0; i < data.length; i += 4) {
    assert(data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 0, 'Original colors were not removed.');
    if (data[i + 3]) visible++;
  }
  assert(visible > 0, 'The mask is empty.');
  return data;
}
let png, svg;
await check('Colored and white PNG content becomes black, preserves partial alpha and crops the margin', async () => {
  png = await importImage(await pngFile(ctx => {
    ctx.fillStyle = '#ff2800'; ctx.fillRect(6, 4, 12, 24);
    ctx.fillStyle = '#fff'; ctx.fillRect(26, 4, 12, 24);
    ctx.fillStyle = 'rgba(0,100,255,.5)'; ctx.fillRect(18, 10, 8, 12);
  }));
  const data = assertBlack(png);
  assert(png.canvas.width === 32 && png.canvas.height === 24, 'Incorrect crop.');
  assert([...data].some((value, index) => index % 4 === 3 && value > 0 && value < 255), 'Partial alpha was lost.');
});
await check('PNG with a fully opaque background is rejected', async () => {
  try { await importImage(await pngFile(ctx => { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 48, 32); })); }
  catch (error) { assert(error.message.includes('opaque background'), error.message); return; }
  throw new Error('An opaque PNG was accepted.');
});
await check('Fully transparent PNG is rejected', async () => {
  try { await importImage(await pngFile(() => {})); }
  catch (error) { assert(error.message.includes('visible content'), error.message); return; }
  throw new Error('An empty PNG was accepted.');
});
await check('Colored SVG with a viewBox, cutouts and a local gradient becomes black', async () => {
  const contents = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 240">
    <defs><linearGradient id="g"><stop stop-color="red"/><stop offset="1" stop-color="blue"/></linearGradient></defs>
    <path fill="url('#g')" fill-rule="evenodd" d="M20 20h180v200H20zM65 65v110h90V65z"/>
    <circle cx="320" cy="120" r="100" fill="#3264ff"/>
    <path d="M500 20 590 220H410z" fill="white"/></svg>`;
  svg = await importImage(new File([contents], 'logo.svg', { type: 'image/svg+xml' }));
  const data = assertBlack(svg);
  assert(svg.canvas.width > svg.canvas.height * 2, 'The viewBox aspect ratio was lost.');
  assert([...data].some((value, index) => index % 4 === 3 && value === 0), 'The cutout lost its transparency.');
});
await check('Invalid SVG and fake PNG files are rejected', async () => {
  for (const file of [new File(['<svg broken'], 'bad.svg'), new File(['JPEG'], 'bad.png')]) {
    let rejected = false;
    try { await importImage(file); } catch { rejected = true; }
    assert(rejected, `${file.name} was accepted.`);
  }
});
await check('SVG silhouette renders in WebGL and can be replaced with PNG', async () => {
  const canvas = document.querySelector('#render-test');
  const renderer = createRenderer(canvas, { mode: 'image', image: svg, strength: 0, bloom: 0 });
  const settle = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  try {
    await settle();
    const screenshot = document.createElement('canvas'); screenshot.width = canvas.width; screenshot.height = canvas.height;
    const context = screenshot.getContext('2d'); context.drawImage(canvas, 0, 0);
    const data = context.getImageData(0, 0, screenshot.width, screenshot.height).data;
    let dark = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] < 25 && data[i + 1] < 25 && data[i + 2] < 25) dark++;
    assert(dark > 1000, 'The black silhouette was not drawn.');
    renderer.update({ image: png, strength: 65, bloom: 65 }); await settle();
    assert(canvas.width > 0 && !canvas.getContext('webgl').getError(), 'WebGL error when switching content.');
  } finally { renderer.dispose(); }
});
document.querySelector('#summary').textContent = `${passed} passed; ${failed} failed.`;
