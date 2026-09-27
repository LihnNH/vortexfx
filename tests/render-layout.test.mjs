import test from 'node:test';
import assert from 'node:assert/strict';
import { getTextLayout, getImageLayout } from '../src/render-layout.js';

test('extra viewport height does not strengthen effects on width-limited text', () => {
  assert.deepEqual(getTextLayout(990, 300, 1700), getTextLayout(990, 1500, 1700));
});

test('uniform resizing scales text and its effects by the same factor', () => {
  for (const [width, height] of [[990, 250], [550, 550], [320, 800], [1800, 200]]) {
    const original = getTextLayout(width, height, 1700);
    const enlarged = getTextLayout(width * 3, height * 3, 1700);
    assert.ok(Math.abs(enlarged.fontSize / original.fontSize - 3) < 1e-10);
    assert.ok(Math.abs(enlarged.effectScale / original.effectScale - 3) < 1e-10);
    assert.ok(original.fontSize * 1700 / 396 <= width * .86 + 1e-10);
  }
});

test('image fitting preserves aspect ratio and relative effect scale', () => {
  for (const [width, height] of [[990, 250], [550, 550], [320, 800], [1800, 200]]) {
    for (const [imageWidth, imageHeight] of [[600, 240], [240, 600]]) {
      const original = getImageLayout(width, height, imageWidth, imageHeight);
      const enlarged = getImageLayout(width * 2, height * 2, imageWidth, imageHeight);
      assert.ok(Math.abs(original.width / original.height - imageWidth / imageHeight) < 1e-10);
      assert.ok(original.width <= width * .84 + 1e-10);
      assert.ok(original.height <= height * .72 + 1e-10);
      assert.ok(Math.abs(enlarged.effectScale / original.effectScale - 2) < 1e-10);
    }
  }
});
