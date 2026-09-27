import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePixels, importImage } from '../src/import-image.js';

test('converts colored and white content to black, retaining partial transparency and cropping', () => {
  const pixels = new Uint8ClampedArray([
    255, 0, 0, 0, 0, 220, 30, 0, 255, 255, 255, 0,
    255, 0, 0, 0, 255, 20, 30, 255, 255, 255, 255, 128,
  ]);
  assert.deepEqual(normalizePixels(pixels, 3, 2, true), { x: 1, y: 1, width: 2, height: 1 });
  assert.deepEqual([...pixels.slice(16)], [0, 0, 0, 255, 0, 0, 0, 128]);
});
test('rejects opaque PNGs and invisible content', () => {
  assert.throws(() => normalizePixels(new Uint8ClampedArray([255, 255, 255, 255]), 1, 1, true), /opaque background/);
  assert.throws(() => normalizePixels(new Uint8ClampedArray([0, 0, 0, 0]), 1, 1, true), /visible content/);
});
test('accepts opaque SVG geometry as content and makes it black', () => {
  const pixels = new Uint8ClampedArray([255, 255, 255, 255]);
  assert.deepEqual(normalizePixels(pixels, 1, 1, false), { x: 0, y: 0, width: 1, height: 1 });
  assert.deepEqual([...pixels], [0, 0, 0, 255]);
});
test('rejects unsupported extensions and files disguised as PNG', async () => {
  await assert.rejects(importImage({ name: 'photo.jpg' }), /only transparent PNG/);
  await assert.rejects(importImage({ name: 'fake.png', slice: () => new Blob(['not png']) }), /valid PNG/);
});
