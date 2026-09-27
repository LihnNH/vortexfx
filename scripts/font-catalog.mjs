import { readdir } from 'node:fs/promises';
import path from 'node:path';

export async function discoverFonts(directory) {
  const files = [];
  async function visit(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const filename = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(filename);
      else if (/\.(ttf|otf|woff2?)$/i.test(entry.name)) files.push(filename);
    }
  }
  try { await visit(directory); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  return files.sort().map(filename => {
    const relative = path.relative(directory, filename).split(path.sep).join('/');
    const name = path.basename(filename).replace(/\.(ttf|otf|woff2?)$/i, '').replace(/[-_]+/g, ' ');
    return {
      id: relative,
      name: name.replace(/\b\w/g, letter => letter.toUpperCase()),
      family: 'ImportedFont_' + Buffer.from(relative).toString('hex'),
      url: '/fonts/' + relative.split('/').map(encodeURIComponent).join('/'),
      ui: relative.startsWith('ui/'),
    };
  });
}

export function fontCatalogPlugin() {
  const moduleId = 'virtual:font-catalog', resolvedId = '\0' + moduleId;
  let fontsDirectory;
  return {
    name: 'local-font-catalog',
    configResolved(config) { fontsDirectory = path.resolve(config.publicDir, 'fonts'); },
    resolveId(id) { if (id === moduleId) return resolvedId; },
    async load(id) {
      if (id === resolvedId) return `export default ${JSON.stringify(await discoverFonts(fontsDirectory))};`;
    },
    configureServer(server) {
      server.watcher.add(fontsDirectory);
      const changed = filename => {
        const relative = path.relative(fontsDirectory, filename);
        if (relative.startsWith('..') || path.isAbsolute(relative) || !/\.(ttf|otf|woff2?)$/i.test(filename)) return;
        const module = server.moduleGraph.getModuleById(resolvedId);
        if (module) server.moduleGraph.invalidateModule(module);
        server.ws.send({ type: 'full-reload' });
      };
      server.watcher.on('add', changed).on('unlink', changed).on('change', changed);
      server.httpServer?.once('close', () => {
        for (const event of ['add', 'unlink', 'change']) server.watcher.off(event, changed);
      });
    },
  };
}
