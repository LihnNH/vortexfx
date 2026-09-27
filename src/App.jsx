import { useEffect, useRef, useState } from 'react';
import localFonts from 'virtual:font-catalog';
import { loadFontWithFallback, loadInterfaceFont, fallbackFont } from './fonts.js';
import { createRenderer } from './renderer.js';
import { importImage } from './import-image.js';
import { DEFAULT_CONTROLS, DEFAULT_COLORS, colorToHex, hexToColor } from './settings.js';

const fonts = [fallbackFont, ...localFonts];
const defaultFont = localFonts.find(font => !font.ui) || localFonts[0] || fallbackFont;

function Slider({ id, label, value, onChange }) {
  return <div className="slider-control">
    <label htmlFor={id}>{label}<output>{value}</output></label>
    <input id={id} type="range" min="0" max="100" value={value} onChange={event => onChange(Number(event.target.value))} />
  </div>;
}

export default function App() {
  const canvasRef = useRef(null), rendererRef = useRef(null), fileRef = useRef(null);
  const fontRequest = useRef(0), imageRequest = useRef(0);
  const [text, setText] = useState('TEXT');
  const [selectedFont, setSelectedFont] = useState(defaultFont);
  const [fontFamily, setFontFamily] = useState(defaultFont?.family || 'serif');
  const [image, setImage] = useState(null), [mode, setMode] = useState('text');
  const [strength, setStrength] = useState(DEFAULT_CONTROLS.strength), [spacing, setSpacing] = useState(DEFAULT_CONTROLS.spacing), [bloom, setBloom] = useState(DEFAULT_CONTROLS.bloom);
  const [effect, setEffect] = useState(DEFAULT_CONTROLS.effect), [speed, setSpeed] = useState(DEFAULT_CONTROLS.speed);
  const [colors, setColors] = useState(DEFAULT_COLORS);
  const [animated, setAnimated] = useState(false), [dragged, setDragged] = useState(false);
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [fontLoading, setFontLoading] = useState(false);
  const [error, setError] = useState(''), [fatalError, setFatalError] = useState('');
  const settings = { text, fontFamily, image, mode, strength, spacing, bloom, effect, speed, animated, colors };
  const settingsRef = useRef(settings);

  useEffect(() => {
    let alive = true;
    loadInterfaceFont(localFonts).catch(() => {});
    loadFontWithFallback(defaultFont).then(({ font, family }) => {
      if (!alive) return;
      settingsRef.current = { ...settingsRef.current, fontFamily: family };
      setFontFamily(family);
      setSelectedFont(font);
      rendererRef.current = createRenderer(canvasRef.current, settingsRef.current, {
        onDrag: () => setDragged(true), onError: setFatalError,
      });
      setReady(true);
    }).catch(error => { if (alive) setFatalError(error.message); });
    return () => {
      alive = false; fontRequest.current++; imageRequest.current++;
      rendererRef.current?.dispose(); rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    settingsRef.current = settings;
    rendererRef.current?.update(settings);
  }, [text, fontFamily, image, mode, strength, spacing, bloom, effect, speed, animated, colors]);

  useEffect(() => {
    const syncFullscreen = () => document.body.classList.toggle('immersive', Boolean(document.fullscreenElement));
    const escape = event => { if (event.key === 'Escape' && !document.fullscreenElement) document.body.classList.remove('immersive'); };
    document.addEventListener('fullscreenchange', syncFullscreen);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreen);
      document.removeEventListener('keydown', escape);
      document.body.classList.remove('immersive');
    };
  }, []);

  async function changeFont(id) {
    const font = fonts.find(font => font.id === id), request = ++fontRequest.current;
    setFontLoading(true); setError('');
    try {
      const loaded = await loadFontWithFallback(font);
      if (request !== fontRequest.current) return;
      setSelectedFont(loaded.font); setFontFamily(loaded.family);
      if (loaded.font.id !== font.id) setError('Could not load this font. Using Inter.');
    } catch { if (request === fontRequest.current) setError('Could not load this font.'); }
    finally { if (request === fontRequest.current) setFontLoading(false); }
  }

  async function chooseImage(event) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    const request = ++imageRequest.current;
    setBusy(true); setError('');
    try {
      const imported = await importImage(file);
      if (request !== imageRequest.current) return;
      setImage(imported); setMode('image'); setDragged(false); rendererRef.current?.reset();
    } catch (error) { if (request === imageRequest.current) setError(error.message); }
    finally { if (request === imageRequest.current) setBusy(false); }
  }

  function reset() {
    setEffect(DEFAULT_CONTROLS.effect); setSpeed(DEFAULT_CONTROLS.speed);
    setStrength(DEFAULT_CONTROLS.strength); setSpacing(DEFAULT_CONTROLS.spacing); setBloom(DEFAULT_CONTROLS.bloom);
    setColors(DEFAULT_COLORS); setAnimated(false); setDragged(false); setError('');
    rendererRef.current?.reset();
  }
  async function exportPNG() {
    setError('');
    try { await rendererRef.current?.exportPNG(); } catch (error) { setError(error.message); }
  }
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch { document.body.classList.toggle('immersive'); }
  }

  return <main>
    <header className="masthead">
      <a className="wordmark" href={import.meta.env.BASE_URL} aria-label="VortexFX home">vortex<span>fx</span></a>
      <span className="edition">DISTORTION STUDY / 001</span>
      <button onClick={fullscreen} className="icon-button" aria-label="Fullscreen" title="Fullscreen">↗</button>
    </header>
    <section className="stage" aria-label="Interactive circular distortion">
      <canvas ref={canvasRef} id="art" tabIndex="0" aria-label="Drag the artwork with your mouse or use the arrow keys. The waves stay fixed." />
      <div className="stage-label"><span className="dot" />CIRCULAR FIELD · {mode === 'image' ? 'FREEFORM IMAGE' : 'FREEFORM TEXT'}</div>
      <div className={`drag-hint${dragged ? ' used' : ''}`}><span>↔</span>drag the {mode === 'image' ? 'image' : 'text'} to feel the waves</div>
      {fatalError && <div id="error" role="alert">{fatalError}</div>}
    </section>
    <footer className="toolbar">
      <div className="source-row">
        <div className="source-switch" role="group" aria-label="Artwork source">
          <button aria-pressed={mode === 'text'} onClick={() => { setMode('text'); setError(''); }}>Text</button>
          <button aria-pressed={mode === 'image'} disabled={!image} onClick={() => { setMode('image'); setError(''); }}>Image</button>
        </div>
        <div className="text-control"><label htmlFor="text">YOUR TEXT</label><input id="text" value={text} onChange={event => { setText(event.target.value); setMode('text'); }} maxLength="24" spellCheck="false" autoComplete="off" aria-label="Effect text" disabled={!ready} /></div>
        <div className="font-control"><label htmlFor="font">FONT{fontLoading && <span>LOADING</span>}</label>
          <select id="font" aria-label="Text font" value={selectedFont?.id || ''} disabled={!ready} aria-busy={fontLoading} onChange={event => changeFont(event.target.value)}>
            <optgroup label="Artwork fonts">{fonts.filter(font => !font.ui).map(font => <option key={font.id} value={font.id}>{font.name}</option>)}</optgroup>
            <optgroup label="Interface fonts">{fonts.filter(font => font.ui).map(font => <option key={font.id} value={font.id}>{font.name}</option>)}</optgroup>
          </select>
        </div>
        <div className="import-control">
          <button className="import-button" onClick={() => fileRef.current?.click()} disabled={!ready || busy}>{busy ? 'Importing…' : 'Import image/logo'}<span>↥</span></button>
          <span className="import-caption">Transparent PNG or SVG · black silhouette</span>
          <input ref={fileRef} type="file" accept=".png,.svg,image/png,image/svg+xml" onChange={chooseImage} hidden aria-label="Transparent PNG or SVG file" />
        </div>
        {image && <div className="image-name" title={image.name}>{image.name}<button aria-label="Remove image" onClick={() => { setImage(null); setMode('text'); }}>×</button></div>}
      </div>
      <div className="adjustment-row">
        <Slider id="effect" label="EFFECT FORCE" value={effect} onChange={setEffect} />
        <Slider id="strength" label="DISTORTION" value={strength} onChange={setStrength} />
        <Slider id="spacing" label="WAVES" value={spacing} onChange={setSpacing} />
        <Slider id="bloom" label="BLOOM" value={bloom} onChange={setBloom} />
        <Slider id="speed" label="SPEED" value={speed} onChange={setSpeed} />
        <div className="actions">
          <button onClick={() => setAnimated(!animated)} aria-pressed={animated}><span className="play-symbol">{animated ? 'Ⅱ' : '▷'}</span>{animated ? 'Pause' : 'Animate'}</button>
          <button onClick={reset} title="Reset position, effect and colors">Reset<span>↺</span></button>
          <button onClick={exportPNG} className="export" disabled={!ready}>Save PNG<span>↓</span></button>
        </div>
      </div>
      <details className="color-panel">
        <summary>Colors</summary>
        <div className="color-controls">
          {[
            ['background', 'Background'], ['text', 'Text / logo'], ['glowInner', 'Inner glow'],
            ['glowOuter', 'Outer glow'], ['thin', 'Fine strokes'],
          ].map(([key, label]) => <label className="color-control" htmlFor={`color-${key}`} key={key}>
            <span>{label}</span>
            <span className="color-value">
              <input id={`color-${key}`} type="color" value={colorToHex(colors[key])} onChange={event => {
                const color = hexToColor(event.target.value);
                setColors(current => ({ ...current, [key]: color }));
              }} />
              <output htmlFor={`color-${key}`}>{colorToHex(colors[key]).toUpperCase()}</output>
            </span>
          </label>)}
        </div>
      </details>
      {error && <div className="import-error" role="alert">{error}</div>}
    </footer>
    <div className="colophon"><span>TYPOGRAPHY IN MOTION</span><span>{mode === 'image' ? 'IMPORTED SILHOUETTE' : selectedFont?.name.toUpperCase()} / WEBGL</span></div>
  </main>;
}
