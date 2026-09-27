import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { discoverFonts } from '../scripts/font-catalog.mjs';

test('discovers all supported fonts recursively, including ui and encoded filenames', async () => {
  const directory = await mkdtemp(path.resolve('tests/.fonts-'));
  try {
    await mkdir(path.join(directory, 'ui'));
    await mkdir(path.join(directory, 'nested'));
    for (const filename of ['Cambria.ttf', 'ui/Example Regular.otf', 'nested/á test.woff2', 'web.woff', 'notes.txt']) {
      await writeFile(path.join(directory, filename), 'fixture');
    }
    const fonts = await discoverFonts(directory);
    assert.equal(fonts.length, 4);
    assert.equal(fonts.find(font => font.id === 'ui/Example Regular.otf').ui, true);
    assert.equal(fonts.find(font => font.id === 'nested/á test.woff2').url, '/fonts/nested/%C3%A1%20test.woff2');
    assert.equal(new Set(fonts.map(font => font.family)).size, 4);
    await writeFile(path.join(directory, 'new.ttf'), 'fixture');
    assert.equal((await discoverFonts(directory)).length, 5);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('allows a clean checkout without a local fonts directory', async () => {
  const directory = await mkdtemp(path.resolve('tests/.fonts-'));
  try {
    assert.deepEqual(await discoverFonts(directory), []);
    assert.deepEqual(await discoverFonts(path.join(directory, 'missing')), []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
