import { useEffect, useRef, useState } from 'react';
import localFonts from 'virtual:font-catalog';
import { loadFont, loadInterfaceFont, fallbackFont } from './fonts.js';
import { createRenderer } from './renderer.js';
import { importImage } from './import-image.js';

const fonts = [fallbackFont, ...localFonts];
const defaultFont = localFonts.find(font => font.id === 'cambria-bold-italic.ttf') ||
  localFonts.find(font => !font.ui && /charter/i.test(font.id)) || fallbackFont;

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
  const [strength, setStrength] = useState(65), [spacing, setSpacing] = useState(50), [bloom, setBloom] = useState(65);
  const [effect, setEffect] = useState(70), [speed, setSpeed] = useState(50);
  const [animated, setAnimated] = useState(false), [dragged, setDragged] = useState(false);
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [fontLoading, setFontLoading] = useState(false);
  const [error, setError] = useState(''), [fatalError, setFatalError] = useState('');
  const settings = { text, fontFamily, image, mode, strength, spacing, bloom, effect, speed, animated };
  const settingsRef = useRef(settings);

  useEffect(() => {
    let alive = true;
    loadInterfaceFont(localFonts).catch(() => {});
    loadFont(defaultFont).catch(() => loadFont(fallbackFont)).then(family => {
      if (!alive) return;
      settingsRef.current = { ...settingsRef.current, fontFamily: family };
      setFontFamily(family);
      if (family === fallbackFont.family) setSelectedFont(fallbackFont);
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
  }, [text, fontFamily, image, mode, strength, spacing, bloom, effect, speed, animated]);

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
      const family = await loadFont(font);
      if (request !== fontRequest.current) return;
      setSelectedFont(font); setFontFamily(family);
    } catch { if (request === fontRequest.current) setError('Não foi possível carregar esta fonte.'); }
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
    setEffect(70); setSpeed(50);
    setStrength(65); setSpacing(50); setBloom(65); setAnimated(false); setDragged(false); setError('');
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
      <a className="wordmark" href={import.meta.env.BASE_URL} aria-label="VortexFX início">vortex<span>fx</span></a>
      <span className="edition">ESTUDO DE DISTORÇÃO / 001</span>
      <button onClick={fullscreen} className="icon-button" aria-label="Tela cheia" title="Tela cheia">↗</button>
    </header>
    <section className="stage" aria-label="Distorção circular interativa">
      <canvas ref={canvasRef} id="art" tabIndex="0" aria-label="Arraste a arte com o mouse ou use as setas do teclado. As ondas ficam fixas." />
      <div className="stage-label"><span className="dot" />CAMPO CIRCULAR · {mode === 'image' ? 'IMAGEM LIVRE' : 'TEXTO LIVRE'}</div>
      <div className={`drag-hint${dragged ? ' used' : ''}`}><span>↔</span>arraste {mode === 'image' ? 'a imagem' : 'o texto'} para sentir as ondas</div>
      {fatalError && <div id="error" role="alert">{fatalError}</div>}
    </section>
    <footer className="toolbar">
      <div className="source-row">
        <div className="source-switch" role="group" aria-label="Conteúdo da arte">
          <button aria-pressed={mode === 'text'} onClick={() => { setMode('text'); setError(''); }}>Texto</button>
          <button aria-pressed={mode === 'image'} disabled={!image} onClick={() => { setMode('image'); setError(''); }}>Imagem</button>
        </div>
        <div className="text-control"><label htmlFor="text">SEU TEXTO</label><input id="text" value={text} onChange={event => { setText(event.target.value); setMode('text'); }} maxLength="24" spellCheck="false" autoComplete="off" aria-label="Texto do efeito" disabled={!ready} /></div>
        <div className="font-control"><label htmlFor="font">FONTE{fontLoading && <span>CARREGANDO</span>}</label>
          <select id="font" aria-label="Fonte do texto" value={selectedFont?.id || ''} disabled={!ready} aria-busy={fontLoading} onChange={event => changeFont(event.target.value)}>
            <optgroup label="Fontes da arte">{fonts.filter(font => !font.ui).map(font => <option key={font.id} value={font.id}>{font.name}</option>)}</optgroup>
            <optgroup label="Fontes da interface">{fonts.filter(font => font.ui).map(font => <option key={font.id} value={font.id}>{font.name}</option>)}</optgroup>
          </select>
        </div>
        <div className="import-control">
          <button className="import-button" onClick={() => fileRef.current?.click()} disabled={!ready || busy}>{busy ? 'Importando…' : 'Importar foto/logo'}<span>↥</span></button>
          <span className="import-caption">PNG transparente ou SVG · silhueta preta</span>
          <input ref={fileRef} type="file" accept=".png,.svg,image/png,image/svg+xml" onChange={chooseImage} hidden aria-label="Arquivo PNG transparente ou SVG" />
        </div>
        {image && <div className="image-name" title={image.name}>{image.name}<button aria-label="Remover imagem" onClick={() => { setImage(null); setMode('text'); }}>×</button></div>}
      </div>
      <div className="adjustment-row">
        <Slider id="effect" label="FORÇA DO EFEITO" value={effect} onChange={setEffect} />
        <Slider id="strength" label="DISTORÇÃO" value={strength} onChange={setStrength} />
        <Slider id="spacing" label="ONDAS" value={spacing} onChange={setSpacing} />
        <Slider id="bloom" label="BLOOM" value={bloom} onChange={setBloom} />
        <Slider id="speed" label="VELOCIDADE" value={speed} onChange={setSpeed} />
        <div className="actions">
          <button onClick={() => setAnimated(!animated)} aria-pressed={animated}><span className="play-symbol">{animated ? 'Ⅱ' : '▷'}</span>{animated ? 'Pausar' : 'Animar'}</button>
          <button onClick={reset} title="Restaurar posição e efeito">Reiniciar<span>↺</span></button>
          <button onClick={exportPNG} className="export" disabled={!ready}>Salvar PNG<span>↓</span></button>
        </div>
      </div>
      {error && <div className="import-error" role="alert">{error}</div>}
    </footer>
    <div className="colophon"><span>TIPOGRAFIA EM MOVIMENTO</span><span>{mode === 'image' ? 'SILHUETA IMPORTADA' : selectedFont?.name.toUpperCase()} / WEBGL</span></div>
  </main>;
}
