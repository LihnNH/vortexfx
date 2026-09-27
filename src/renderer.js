import { DEFAULT_CONTROLS, DEFAULT_COLORS } from './settings.js';
import { getTextLayout, getImageLayout, REFERENCE_FONT_SIZE, REFERENCE_SIZE } from './render-layout.js';

function postEffectScale(force) {
  return force < 5 ? 0 : (force - 4) / 66;
}

export function createRenderer(canvas, initialSettings = {}, callbacks = {}) {
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, preserveDrawingBuffer: true });
  if (!gl) throw new Error('Could not initialize WebGL in this browser.');
  let settings = { text: 'TEXT', fontFamily: 'serif', mode: 'text', image: null, ...DEFAULT_CONTROLS, animated: false, ...initialSettings, colors: { ...DEFAULT_COLORS, ...initialSettings.colors } };
  let disposed = false;
  const shaders = [], subscriptions = [];
  const listen = (target, event, handler) => {
    target.addEventListener(event, handler);
    subscriptions.push(() => target.removeEventListener(event, handler));
  };
  const vertex = `attribute vec2 position; void main(){ gl_Position=vec4(position,0.,1.); }`;
  const fragment = `
    ${gl.getExtension('OES_standard_derivatives') ? '#extension GL_OES_standard_derivatives : enable\n#define HAS_DERIVATIVES' : ''}
    precision highp float;
    uniform sampler2D lettering;
    uniform sampler2D wideLettering;
    uniform sampler2D sharpLettering;
    uniform vec2 resolution;
    uniform vec2 offset;
    uniform float pixelRatio;
    uniform vec2 targetSize;
    uniform vec2 fieldSize;
    uniform vec2 maskSize;
    uniform float artworkScale;
    uniform float amplitude;
    uniform float wavelength;
    uniform float phase;
    uniform float glowPass;
    uniform float effectStrength;
    uniform vec3 backgroundColor;
    uniform vec3 textColor;
    uniform vec3 flatInkColor;
    uniform vec3 thinColor;
    float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
    float noise(vec2 p){
      vec2 cell=floor(p), f=fract(p);
      f=f*f*(3.-2.*f);
      return mix(mix(hash(cell),hash(cell+vec2(1.,0.)),f.x),mix(hash(cell+vec2(0.,1.)),hash(cell+vec2(1.,1.)),f.x),f.y);
    }
    void main(){
      vec2 p=gl_FragCoord.xy*resolution/targetSize;
      vec2 fromCenter=p-resolution*.5;
      float radius=length(fromCenter);
      float wave=radius/(wavelength*artworkScale)*6.2831853-phase;
      // Blender: mix Blur 22 / Blur 100 using Noise 4, then Less Than
      // against spherical rings. The ring/noise field stays fixed during drag.
      vec2 uv=(fromCenter-offset)/artworkScale/maskSize+.5;
      float valid=step(0.,uv.x)*step(0.,uv.y)*step(uv.x,1.)*step(uv.y,1.);
      float nearText=texture2D(lettering,uv).a*valid;
      float wideText=texture2D(wideLettering,uv).a*valid;
      float sharpText=texture2D(sharpLettering,uv).a*valid;
      vec2 fieldUV=fromCenter/artworkScale/fieldSize+.5;
      float mixing=smoothstep(.24,.76,noise(fieldUV*4.+vec2(2.3,5.7)));
      mixing=clamp(mixing*amplitude/18.85*(effectStrength/.7),0.,.98);
      float threshold=2.*mix(nearText,wideText,mixing);
      // A low threshold produces narrow ring fragments rather than solid type.
      float thinness=1.-smoothstep(.035,.34,threshold);
      float rings=.5+.5*sin(wave);
      float difference=threshold-rings;
      float aa=.003;
      #ifdef HAS_DERIVATIVES
        aa=max(fwidth(difference)*.55,.001);
      #endif
      float body=smoothstep(-aa,aa,difference)*step(.0015,threshold);
      body=mix(sharpText,body,smoothstep(0.,.25,amplitude/29.));
      // Grow the thresholded geometry directly, without fading new strokes in.
      if(effectStrength<.05) body=sharpText;
      if(glowPass>.5){
        // Emissive white silhouette before bloom and inversion in Blender.
        gl_FragColor=vec4(vec3(body*mix(1.,.28,thinness)),1.);
        return;
      }
      vec3 paper=backgroundColor;
      float grain=hash(floor(p*pixelRatio))-.5;
      float mottling=(hash(floor(p/3.7))-.5)*.019+(hash(floor(p/18.))-.5)*.01;
      paper+=grain*.046+mottling;
      paper-=.025*pow(length(fromCenter/resolution),1.5);
      vec3 inkColor=mix(textColor,thinColor,thinness*.68);
      float finish=smoothstep(.04,.7,effectStrength);
      inkColor=mix(flatInkColor,inkColor,finish);
      vec3 color=mix(paper,inkColor,body);
      color+=grain*.028*body*finish;
      // Preserve the exact ink coverage for the post-process exclusion mask.
      gl_FragColor=vec4(color,body);
    }`;
  function shader(type, source) {
    const result = gl.createShader(type); shaders.push(result);
    gl.shaderSource(result, source); gl.compileShader(result);
    if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(result));
    return result;
  }
  function makeProgram(fragmentSource) {
    const result=gl.createProgram();
    gl.attachShader(result,shader(gl.VERTEX_SHADER,vertex));
    gl.attachShader(result,shader(gl.FRAGMENT_SHADER,fragmentSource));
    gl.bindAttribLocation(result,0,'position'); gl.linkProgram(result);
    if(!gl.getProgramParameter(result,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(result));
    return result;
  }
  const program=makeProgram(fragment);
  const blurProgram=makeProgram(`
    precision highp float;
    uniform sampler2D image;
    uniform vec2 size;
    uniform vec2 direction;
    void main(){
      vec2 uv=gl_FragCoord.xy/size;
      vec3 color=vec3(0.);
      float total=0.;
      // Dense Gaussian taps avoid repeated outlines and square-looking halos.
      for(int i=-6;i<=6;i++){
        float distance=float(i);
        float weight=exp(-distance*distance/8.);
        color+=texture2D(image,uv+direction*distance).rgb*weight;
        total+=weight;
      }
      gl_FragColor=vec4(color/total,1.);
    }`);
  const compositeProgram=makeProgram(`
    precision highp float;
    uniform sampler2D scene;
    uniform sampler2D glow;
    uniform sampler2D aura;
    uniform vec2 size;
    uniform float intensity;
    uniform vec3 innerGlowColor;
    uniform vec3 outerGlowColor;
    float grain(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453)-.5;}
    void main(){
      vec2 uv=gl_FragCoord.xy/size;
      vec4 artwork=texture2D(scene,uv);
      vec3 base=artwork.rgb;
      float outside=1.-artwork.a;
      float nearGlow=texture2D(glow,uv).b*intensity;
      float wideGlow=texture2D(aura,uv).b*intensity;
      // Both halos are clipped by the actual type mask, never by brightness.
      // The wider warm veil fades out beyond the closer violet fringe.
      // A smooth color ramp after bloom/inversion: warm tail, red fine
      // filaments, violet around the heavier silhouettes, then black ink.
      // Shift the original red midpoint with both editable halo endpoints.
      vec3 transitionColor=clamp(vec3(.66,.29,.34)+.5*(innerGlowColor-vec3(.66,.065,.78))+.5*(outerGlowColor-vec3(.94,.80,.61)),0.,1.);
      // Equal endpoints produce a single-color halo, including the white preset.
      float matchingGlow=1.-smoothstep(0.,.08,length(innerGlowColor-outerGlowColor));
      transitionColor=mix(transitionColor,(innerGlowColor+outerGlowColor)*.5,matchingGlow);
      vec3 color=mix(base,outerGlowColor,smoothstep(.015,.12,wideGlow)*.32*outside);
      color=mix(color,transitionColor,smoothstep(.025,.15,nearGlow)*.48*outside);
      color=mix(color,innerGlowColor,smoothstep(.12,.44,nearGlow)*.94*outside);
      color+=grain(gl_FragCoord.xy)*.04*min(nearGlow*3.,1.)*outside;
      gl_FragColor=vec4(color,1.);
    }`);
  const blurUniforms=Object.fromEntries(['image','size','direction'].map(key=>[key,gl.getUniformLocation(blurProgram,key)]));
  const compositeUniforms=Object.fromEntries(['scene','glow','aura','size','intensity','innerGlowColor','outerGlowColor'].map(key=>[key,gl.getUniformLocation(compositeProgram,key)]));
  gl.useProgram(program);
  const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'position');
  gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const uniforms = Object.fromEntries(['lettering','wideLettering','sharpLettering','resolution','offset','pixelRatio','targetSize','fieldSize','maskSize','artworkScale','amplitude','wavelength','phase','glowPass','effectStrength','backgroundColor','textColor','flatInkColor','thinColor'].map(key => [key, gl.getUniformLocation(program,key)]));
  gl.uniform2f(uniforms.fieldSize,REFERENCE_SIZE.width,REFERENCE_SIZE.height);
  function textTexture(){
    const result=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,result);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    return result;
  }
  const texture=textTexture(), wideTexture=textTexture(), sharpTexture=textTexture();
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.uniform1i(uniforms.lettering, 0);
  gl.uniform1i(uniforms.wideLettering,1); gl.uniform1i(uniforms.sharpLettering,2);
  // Full-resolution artwork plus two smaller buffers for broad, smooth bloom.
  function target() {
    const result={texture:gl.createTexture(),framebuffer:gl.createFramebuffer(),width:0,height:0};
    gl.bindTexture(gl.TEXTURE_2D,result.texture);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER,result.framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,result.texture,0);
    return result;
  }
  const sceneTarget=target(), glowA=target(), glowB=target(), nearGlowTarget=target();
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  function allocate(result,w,h) {
    result.width=w; result.height=h;
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,result.texture);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
    gl.bindFramebuffer(gl.FRAMEBUFFER,result.framebuffer);
    if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE) throw new Error('Bloom framebuffer unavailable.');
  }
  function bindTarget(result) {
    gl.bindFramebuffer(gl.FRAMEBUFFER,result?.framebuffer || null);
    gl.viewport(0,0,result?.width || canvas.width,result?.height || canvas.height);
  }
  const source = document.createElement('canvas');
  const ctx = source.getContext('2d');
  const maxTextureSize=gl.getParameter(gl.MAX_TEXTURE_SIZE);
  let maskWidth=0, maskHeight=0, referenceInkWidth=0;
  let width=0, height=0, dpr=1, artworkScale=1, offset={x:0,y:0}, dragging=null, phase=0, animated=false, lastTime=0, frame=0;
  function layoutArtwork() {
    const image=settings.mode==='image' && settings.image?.canvas;
    artworkScale=(image ? getImageLayout(width,height,image.width,image.height) : getTextLayout(width,height,referenceInkWidth)).effectScale;
  }
  function lettering() {
    const image=settings.mode==='image' && settings.image?.canvas;
    const value=settings.text || ' ';
    ctx.font=`${REFERENCE_FONT_SIZE}px "${settings.fontFamily}"`;
    const bounds=ctx.measureText(value);
    referenceInkWidth=bounds.actualBoundingBoxLeft+bounds.actualBoundingBoxRight;
    const inkWidth=image ? REFERENCE_FONT_SIZE*image.width/image.height : referenceInkWidth;
    const inkHeight=image ? REFERENCE_FONT_SIZE : bounds.actualBoundingBoxAscent+bounds.actualBoundingBoxDescent;
    const blurPower=postEffectScale(settings.effect);
    // Fixed logical masks keep Gaussian kernels and glyph metrics identical
    // at every viewport size. Padding contains the widest blur's tail.
    const padding=Math.ceil(Math.max(120,100*blurPower**2)+REFERENCE_FONT_SIZE*.035);
    maskWidth=Math.max(1,Math.ceil(inkWidth+padding*2));
    maskHeight=Math.max(1,Math.ceil(inkHeight+padding*2));
    const rasterScale=Math.min(1,maxTextureSize/maskWidth,maxTextureSize/maskHeight);
    source.width=Math.min(maxTextureSize,Math.max(1,Math.ceil(maskWidth*rasterScale)));
    source.height=Math.min(maxTextureSize,Math.max(1,Math.ceil(maskHeight*rasterScale)));
    ctx.setTransform(source.width/maskWidth,0,0,source.height/maskHeight,source.width/2,source.height/2);
    if (image) {
      ctx.drawImage(image,-inkWidth/2,-inkHeight/2,inkWidth,inkHeight);
    } else {
    ctx.font=`${REFERENCE_FONT_SIZE}px "${settings.fontFamily}"`;
    const left=bounds.actualBoundingBoxLeft, right=bounds.actualBoundingBoxRight;
    const ascent=bounds.actualBoundingBoxAscent, descent=bounds.actualBoundingBoxDescent;
    ctx.fillStyle='#fff'; ctx.strokeStyle='#fff'; ctx.lineWidth=REFERENCE_FONT_SIZE*.035; ctx.lineJoin='round';
    const x=-(right-left)/2, y=(ascent-descent)/2;
    ctx.strokeText(value,x,y); ctx.fillText(value,x,y);
    }
    // Approximate the finite Blender Gaussian kernel with sigma=width/6.
    for(const [targetTexture,blurSize] of [[sharpTexture,0],[texture,22],[wideTexture,100]]){
      let pixels=source;
      if(blurSize && blurPower > 0){
        pixels=document.createElement('canvas'); pixels.width=source.width; pixels.height=source.height;
        const blurred=pixels.getContext('2d');
        blurred.filter=`blur(${blurSize*rasterScale/6*blurPower**2}px)`;
        blurred.drawImage(source,0,0);
      }
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,targetTexture);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    }
    layoutArtwork();
    requestDraw();
  }
  function resize() {
    const rect=canvas.getBoundingClientRect();
    width=Math.max(1,rect.width); height=Math.max(1,rect.height);
    dpr=Math.min(window.devicePixelRatio || 1,2);
    canvas.width=Math.round(width*dpr); canvas.height=Math.round(height*dpr);
    allocate(sceneTarget,canvas.width,canvas.height);
    allocate(glowA,Math.max(1,Math.round(width/4)),Math.max(1,Math.round(height/4)));
    allocate(glowB,glowA.width,glowA.height);
    allocate(nearGlowTarget,glowA.width,glowA.height);
    bindTarget(null); gl.useProgram(program);
    gl.uniform2f(uniforms.resolution,width,height); gl.uniform1f(uniforms.pixelRatio,dpr);
    if(maskWidth) { layoutArtwork(); requestDraw(); }
    else lettering();
  }
  function draw(time=0) {
    frame=0;
    if (animated && lastTime) phase+=Math.min((time-lastTime)/1000,.05)*1.7*(settings.speed/50)**2;
    lastTime=time;
    const bloomIntensity=settings.bloom/100*postEffectScale(settings.effect);
    gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D,wideTexture);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D,sharpTexture);
    gl.activeTexture(gl.TEXTURE0);
    bindTarget(bloomIntensity>0?sceneTarget:null);
    gl.uniform1f(uniforms.pixelRatio,dpr);
    gl.uniform2f(uniforms.targetSize,canvas.width,canvas.height);
    gl.uniform1f(uniforms.artworkScale,artworkScale);
    gl.uniform2f(uniforms.maskSize,maskWidth,maskHeight);
    gl.uniform1f(uniforms.glowPass,0);
    gl.uniform2f(uniforms.offset,offset.x*artworkScale,-offset.y*artworkScale);
    gl.uniform1f(uniforms.amplitude,settings.strength*.29);
    gl.uniform1f(uniforms.wavelength,33-settings.spacing*.28);
    gl.uniform1f(uniforms.phase,phase);
    gl.uniform1f(uniforms.effectStrength,settings.effect/100);
    gl.uniform3fv(uniforms.backgroundColor,settings.colors.background);
    gl.uniform3fv(uniforms.textColor,settings.colors.text);
    gl.uniform3fv(uniforms.thinColor,settings.colors.thin);
    const originalInk=settings.colors.text.every((channel,index)=>channel===DEFAULT_COLORS.text[index]);
    gl.uniform3fv(uniforms.flatInkColor,originalInk?[0,0,0]:settings.colors.text);
    gl.drawArrays(gl.TRIANGLES,0,6);
    if(bloomIntensity>0){
      bindTarget(glowA);
      gl.uniform2f(uniforms.targetSize,glowA.width,glowA.height);
      gl.uniform1f(uniforms.glowPass,1);
      gl.drawArrays(gl.TRIANGLES,0,6);
      gl.useProgram(blurProgram);
      gl.uniform1i(blurUniforms.image,0);
      gl.uniform2f(blurUniforms.size,glowA.width,glowA.height);
      const glowScale=artworkScale;
      for(let pass=0;pass<8;pass++){
        const radius=glowScale*(pass<4?.32:.85);
        const horizontal=pass%2===0;
        bindTarget(horizontal?glowB:glowA);
        gl.bindTexture(gl.TEXTURE_2D,horizontal?glowA.texture:glowB.texture);
        gl.uniform2f(blurUniforms.direction,horizontal?radius/glowA.width:0,horizontal?0:radius/glowA.height);
        gl.drawArrays(gl.TRIANGLES,0,6);
        if(pass===3){
          // Keep the compact violet halo before broadening the warm outer aura.
          gl.bindTexture(gl.TEXTURE_2D,nearGlowTarget.texture);
          gl.copyTexSubImage2D(gl.TEXTURE_2D,0,0,0,0,0,glowA.width,glowA.height);
        }
      }
      bindTarget(null); gl.useProgram(compositeProgram);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,sceneTarget.texture);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D,nearGlowTarget.texture);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D,glowA.texture);
      gl.uniform1i(compositeUniforms.scene,0); gl.uniform1i(compositeUniforms.glow,1); gl.uniform1i(compositeUniforms.aura,2);
      gl.uniform2f(compositeUniforms.size,canvas.width,canvas.height);
      gl.uniform1f(compositeUniforms.intensity,bloomIntensity*1.5);
      gl.uniform3fv(compositeUniforms.innerGlowColor,settings.colors.glowInner);
      gl.uniform3fv(compositeUniforms.outerGlowColor,settings.colors.glowOuter);
      gl.drawArrays(gl.TRIANGLES,0,6);
      gl.activeTexture(gl.TEXTURE0);
    }
    if(animated) requestDraw();
  }
  function requestDraw() { if(!disposed && !frame) frame=requestAnimationFrame(draw); }
  const observer = new ResizeObserver(resize); observer.observe(canvas);
  listen(canvas, 'pointerdown',event=>{
    if(event.button!==0) return;
    dragging={id:event.pointerId,x:event.clientX,y:event.clientY,startX:offset.x,startY:offset.y};
    canvas.setPointerCapture(event.pointerId); canvas.classList.add('dragging','pointer-focus'); canvas.focus({preventScroll:true});
  });
  listen(canvas, 'pointermove',event=>{
    if(!dragging || event.pointerId!==dragging.id) return;
    offset.x=Math.max(-width*.8/artworkScale,Math.min(width*.8/artworkScale,dragging.startX+(event.clientX-dragging.x)/artworkScale));
    offset.y=Math.max(-height*.8/artworkScale,Math.min(height*.8/artworkScale,dragging.startY+(event.clientY-dragging.y)/artworkScale));
    callbacks.onDrag?.(); requestDraw();
  });
  function release() { dragging=null; canvas.classList.remove('dragging'); }
  listen(canvas, 'pointerup',release); listen(canvas, 'pointercancel',release); listen(canvas, 'lostpointercapture',release);
  listen(canvas, 'keydown',event=>{
    canvas.classList.remove('pointer-focus');
    const directions={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
    if(!directions[event.key]) return;
    event.preventDefault(); const [x,y]=directions[event.key];
    offset.x+=x*(event.shiftKey?25:8)/artworkScale; offset.y+=y*(event.shiftKey?25:8)/artworkScale; callbacks.onDrag?.(); requestDraw();
  });

  function update(next) {
    if (disposed) return;
    const redrawSource = ['text', 'fontFamily', 'mode', 'image', 'effect'].some(key => key in next && next[key] !== settings[key]);
    if ('animated' in next && next.animated !== animated) { animated = next.animated; lastTime = 0; }
    settings = { ...settings, ...next, colors: { ...settings.colors, ...next.colors } };
    if (redrawSource) lettering(); else requestDraw();
  }
  function reset() { offset = { x: 0, y: 0 }; phase = 0; requestDraw(); }
  function exportPNG() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0; draw(performance.now());
    return new Promise((resolve, reject) => canvas.toBlob(blob => {
      if (!blob) { reject(new Error('Could not save the image.')); return; }
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = 'vortexfx.png'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000); resolve();
    }, 'image/png'));
  }
  function dispose() {
    disposed = true; if (frame) cancelAnimationFrame(frame);
    observer.disconnect(); subscriptions.forEach(unsubscribe => unsubscribe());
    [texture, wideTexture, sharpTexture, sceneTarget.texture, glowA.texture, glowB.texture, nearGlowTarget.texture].forEach(item => gl.deleteTexture(item));
    [sceneTarget, glowA, glowB, nearGlowTarget].forEach(item => gl.deleteFramebuffer(item.framebuffer));
    [program, blurProgram, compositeProgram].forEach(item => gl.deleteProgram(item));
    shaders.forEach(item => gl.deleteShader(item)); gl.deleteBuffer(buffer);
  }
  listen(canvas, 'webglcontextlost', event => {
    event.preventDefault(); if (frame) cancelAnimationFrame(frame); frame = 0;
    callbacks.onError?.('The graphics context was lost. Reload the page.');
  });
  resize();
  return { update, reset, exportPNG, dispose };
}
