(() => {
  const els = {
    imageUpload: document.getElementById('imageUpload'),
    clearImageBtn: document.getElementById('clearImageBtn'),
    alphaThreshold: document.getElementById('alphaThreshold'),
    alphaVal: document.getElementById('alphaVal'),
    refUpload: document.getElementById('refUpload'),
    maskPreview: document.getElementById('maskPreview'),
    wordsInput: document.getElementById('wordsInput'),
    minFont: document.getElementById('minFont'),
    maxFont: document.getElementById('maxFont'),
    fontFamily: document.getElementById('fontFamily'),
    uploadFontBtn: document.getElementById('uploadFontBtn'),
    rotate: document.getElementById('rotate'),
    rotateAngle: document.getElementById('rotateAngle'),
    colorScheme: document.getElementById('colorScheme'),
    fillMode: document.getElementById('fillMode'),
    repeatFactor: document.getElementById('repeatFactor'),
    tileStep: document.getElementById('tileStep'),
    generateBtn: document.getElementById('generateBtn'),
    clearBtn: document.getElementById('clearBtn'),
    exportBtn: document.getElementById('exportBtn'),
    validateBtn: document.getElementById('validateBtn'),
    cloudCanvas: document.getElementById('cloudCanvas'),
    debugCanvas: document.getElementById('debugCanvas'),
    debugOverlay: document.getElementById('debugOverlay'),
    tooltip: document.getElementById('tooltip'),
    coverage: document.getElementById('coverage'),
    leak: document.getElementById('leak'),
    similarity: document.getElementById('similarity'),
    fontViolations: document.getElementById('fontViolations'),
    controlsEl: document.querySelector('.controls'),
    fontError: document.getElementById('fontError'),
    // Custom color UI
    customPrimary: document.getElementById('customPrimary'),
    customSecondary: document.getElementById('customSecondary'),
    customAccent: document.getElementById('customAccent'),
    customPrimaryText: document.getElementById('customPrimaryText'),
    customSecondaryText: document.getElementById('customSecondaryText'),
    customAccentText: document.getElementById('customAccentText'),
    presetName: document.getElementById('presetName'),
    applyCustomBtn: document.getElementById('applyCustomBtn'),
    savePresetBtn: document.getElementById('savePresetBtn'),
    favoriteAddBtn: document.getElementById('favoriteAddBtn'),
    customPreview: document.getElementById('customPreview'),
    favoritesList: document.getElementById('favoritesList'),
    historyList: document.getElementById('historyList'),
    autoWeight: document.getElementById('autoWeight'),
    stopwords: document.getElementById('stopwords'),
    exportSvgBtn: document.getElementById('exportSvgBtn'),
    fontUploadInput: document.getElementById('fontUpload'),
    main: document.querySelector('main.app-main'),
    metrics: document.getElementById('metrics'),
    previewWrap: document.querySelector('.right-bottom .canvas-wrap'),
    wordTableBody: document.getElementById('wordTableBody'),
    addWordRowBtn: document.getElementById('addWordRowBtn'),
    maskOpacity: document.getElementById('maskOpacity'),
    maskOpacityVal: document.getElementById('maskOpacityVal'),
  };

  const cloudCtx = els.cloudCanvas.getContext('2d');
  const maskCtx = els.maskPreview.getContext('2d');
  const debugCtx = els.debugCanvas ? els.debugCanvas.getContext('2d') : null;

  // Offscreen canvas to build the mask at cloud canvas resolution
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = els.cloudCanvas.width;
  maskCanvas.height = els.cloudCanvas.height;
  const maskOffCtx = maskCanvas.getContext('2d');

  // viewport 用于保持与源图一致的宽高比
  let viewport = { x: 0, y: 0, w: els.cloudCanvas.width, h: els.cloudCanvas.height, ratio: els.cloudCanvas.width / els.cloudCanvas.height };
  function computeViewport(containerW, containerH, ratio) {
    let vw = Math.min(containerW, Math.floor(containerH * ratio));
    let vh = Math.floor(vw / ratio);
    if (vw > containerW || vh > containerH) {
      vh = Math.min(containerH, Math.floor(containerW / ratio));
      vw = Math.floor(vh * ratio);
    }
    const vx = Math.floor((containerW - vw) / 2);
    const vy = Math.floor((containerH - vh) / 2);
    return { x: vx, y: vy, w: vw, h: vh, ratio };
  }
  let resizeDebounce = null;
  let baseLocked = false;
  let baseW = els.cloudCanvas.width;
  let baseH = els.cloudCanvas.height;

  function getContainTransform(cwCSS, chCSS) {
    const s = Math.min(cwCSS / baseW, chCSS / baseH);
    const ox = Math.floor((cwCSS - baseW * s) / 2);
    const oy = Math.floor((chCSS - baseH * s) / 2);
    return { s, ox, oy };
  }

  function fastRenderToFit() {
    const wrap = els.previewWrap || (els.cloudCanvas && els.cloudCanvas.parentElement);
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    if (rect.width < 50 || rect.height < 50) {
      if (resizeDebounce) clearTimeout(resizeDebounce);
      resizeDebounce = setTimeout(fastRenderToFit, 120);
      return;
    }
    const dpr = Math.max(1, (window.devicePixelRatio || 1));
    const cwCSS = Math.max(1, Math.floor(rect.width));
    const chCSS = Math.max(1, Math.floor(rect.height));
    const cw = Math.round(cwCSS * dpr);
    const ch = Math.round(chCSS * dpr);
    if (els.cloudCanvas.width !== cw || els.cloudCanvas.height !== ch) {
      els.cloudCanvas.width = cw;
      els.cloudCanvas.height = ch;
    }
    if (els.debugCanvas) {
      if (els.debugCanvas.width !== cw || els.debugCanvas.height !== ch) {
        els.debugCanvas.width = cw; els.debugCanvas.height = ch;
      }
    }
    cloudCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cloudCtx.clearRect(0, 0, cwCSS, chCSS);
    if (!placedWords || !placedWords.length) return;
    const { s, ox, oy } = getContainTransform(cwCSS, chCSS);
    cloudCtx.save();
    cloudCtx.translate(ox, oy);
    cloudCtx.scale(s, s);
    drawMaskUnderlay(cloudCtx, baseW, baseH);
    const t = Math.max(0, Math.min(1, (Number(els.maskOpacity?.value) || 0) / 100));
    for (const w of placedWords) {
      cloudCtx.save();
      cloudCtx.font = `${w.fontSize}px ${w.fontFamily}`;
      cloudCtx.fillStyle = w.color;
      cloudCtx.textBaseline = 'middle';
      cloudCtx.textAlign = 'center';
      cloudCtx.translate(w.x + w.w / 2, w.y + w.h / 2);
      cloudCtx.rotate(w.rotate * Math.PI / 180);
      cloudCtx.globalAlpha = t;
      cloudCtx.fillText(w.text, 0, 0);
      cloudCtx.restore();
    }
    if (binMaskCanvas) applyMaskComposite(cloudCtx, binMaskCanvas);
    cloudCtx.restore();
  }

  function resizeCanvasToSidebar() {
    fastRenderToFit();
  }
  window.addEventListener('load', resizeCanvasToSidebar);
  window.addEventListener('resize', resizeCanvasToSidebar);
  window.addEventListener('load', async () => {
    await loadAppConfig();
    applyConfigToUI();
    getFontRange(false);
    applyRotateFromQuery();
    syncRotateAngleInputState();
    try { els.metrics?.setAttribute('aria-live', 'polite'); } catch (_) {}
    initWordTable();
    initGlobalFontSelect();
    initThemeChips();
    initColorPicker();
    if (els.maskOpacity && els.maskOpacityVal) {
      const v = Math.max(0, Math.min(100, Number(els.maskOpacity.value) || 0));
      if (els.maskOpacityVal.tagName === 'INPUT') els.maskOpacityVal.value = String(v);
      else els.maskOpacityVal.textContent = String(v);
    }
    // 初始适配一次
    try { resizeCanvasToSidebar(); } catch (_) {}
    // 监听窗口变化
    window.addEventListener('resize', () => { try { resizeCanvasToSidebar(); } catch (_) {} });
    // 监听容器尺寸变化
    if (window.ResizeObserver && els.previewWrap) {
      const ro = new ResizeObserver(() => { try { resizeCanvasToSidebar(); } catch (_) {} });
      ro.observe(els.previewWrap);
    }
  });

  // Binary mask for compositing
  let binMaskCanvas = null;

  let maskData = null; // Boolean array: width * height
  let sourceImage = null; // Image element
  let placedWords = []; // { text, weight, x, y, w, h, fontSize, color, rotate }
  let refImageData = null; // reference occupancy (boolean array)
  // 监控：最小字体违规次数
  let fontViolationCount = 0;
  let alphaRegenDebounce = null;

  // --- Configurable font range with validation ---
  const LIMITS = { MIN: 8, MAX: 1024 }; // 内部算法的合理范围
  const STEP16 = 16;
  let appConfig = { font: { minFontSize: 16, maxFontSize: 96 } };

  // --- Glyph rasterization & cache ---
  const GLYPH_ALPHA_THRESHOLD = 32; // alpha>32 considered ink
  const glyphCache = new Map();
  const glyphOrder = [];
  const MAX_GLYPH_CACHE = 400;
  const wordColors = new Map();
  const wordFontBounds = new Map();
  const wordFonts = new Map();
  let ROW_COLORS = ['#F59E0B', '#FFC566', '#FFE1B3', '#C07A08', '#8A5706'];

  function clamp01(x){ return Math.max(0, Math.min(1, x)); }
  function mixColor(hex1, hex2, t){ const a=parseColor(hex1), b=parseColor(hex2); if(!a||!b) return hex1; const m=(x,y)=>Math.round(x+(y-x)*t); return rgbToHex({r:m(a.r,b.r), g:m(a.g,b.g), b:m(a.b,b.b)}); }
  function lighten(hex, p){ return mixColor(hex, '#FFFFFF', clamp01(p)); }
  function darken(hex, p){ return mixColor(hex, '#000000', clamp01(p)); }
  function setThemeColor(themeHex){
    const base = themeHex || '#F59E0B';
    ROW_COLORS = [
      base,
      lighten(base, 0.2),
      lighten(base, 0.4),
      darken(base, 0.12),
      darken(base, 0.24),
    ];
    const chips = document.querySelectorAll('#themeChips .theme-chip');
    chips.forEach(c=>{ if(c.dataset.color?.toUpperCase()===base.toUpperCase()) c.classList.add('active'); else c.classList.remove('active'); });

    // 同步表格已有行颜色
    try {
      if (els.wordTableBody) {
        const rows = els.wordTableBody.querySelectorAll('tr');
        rows.forEach((r, i) => {
          const palette = ROW_COLORS;
          const auto = palette[i % palette.length];
          const colorInp = r.querySelector('td:nth-child(2) input[type="color"]');
          const hexInp = r.querySelector('td:nth-child(2) .hex-input');
          if (colorInp) colorInp.value = auto;
          if (hexInp) hexInp.value = auto.toUpperCase();
        });
        refreshWordColorsFromTable();
      }
    } catch (_) {}

    // 同步画布现有词颜色（位置不变）
    try {
      if (placedWords && placedWords.length) {
        for (const p of placedWords) {
          const ov = wordColors.get(p.text);
          if (ov) p.color = ov;
        }
        fastRenderToFit();
      }
    } catch (_) {}
  }
  function initThemeChips(){
    const wrap = document.getElementById('themeChips'); if(!wrap) return;
    wrap.addEventListener('click', (e)=>{
      const target = e.target.closest('.theme-chip'); if(!target) return;
      const hex = target.dataset.color; if(!hex) return; setThemeColor(hex);
    });
    setThemeColor('#F59E0B');
  }
  const wordAngles = new Map();
  /**
   * @typedef {{primary:string, secondary:string, accent:string, bg?:string, text?:string}} Palette
   * @typedef {{name:string, palette:Palette}} Scheme
   */
  const DEFAULT_BG = getComputedStyle(document.documentElement).getPropertyValue('--wc-bg').trim() || '#0b1220';
  const DEFAULT_TEXT = getComputedStyle(document.documentElement).getPropertyValue('--wc-text').trim() || '#e5e7eb';

  /** Professional color schemes with WCAG adjustments */
  const SCHEMES = {
    professional: { name: 'Professional', palette: { primary: '#4f46e5', secondary: '#14b8a6', accent: '#f59e0b', bg: DEFAULT_BG, text: DEFAULT_TEXT } },
    bright: { name: 'Bright', palette: { primary: '#22d3ee', secondary: '#0ea5e9', accent: '#f59e0b', bg: DEFAULT_BG, text: DEFAULT_TEXT } },
    pastel: { name: 'Pastel', palette: { primary: '#93c5fd', secondary: '#fbcfe8', accent: '#fde68a', bg: DEFAULT_BG, text: DEFAULT_TEXT } },
    mono:   { name: 'Mono',   palette: { primary: '#60a5fa', secondary: '#3b82f6', accent: '#1d4ed8', bg: DEFAULT_BG, text: DEFAULT_TEXT } },
    vibrant:{ name: 'Vibrant',palette: { primary: '#ef4444', secondary: '#22c55e', accent: '#3b82f6', bg: DEFAULT_BG, text: DEFAULT_TEXT } },
    dark:   { name: 'Dark',   palette: { primary: '#eab308', secondary: '#f97316', accent: '#22c55e', bg: '#0b1220', text: '#e5e7eb' } },
    neutral:{ name: 'Neutral',palette: { primary: '#94a3b8', secondary: '#64748b', accent: '#f59e0b', bg: DEFAULT_BG, text: DEFAULT_TEXT } },
    sunset: { name: 'Sunset', palette: { primary: '#fb7185', secondary: '#f59e0b', accent: '#6366f1', bg: DEFAULT_BG, text: DEFAULT_TEXT } },
    forest: { name: 'Forest', palette: { primary: '#16a34a', secondary: '#65a30d', accent: '#22c55e', bg: DEFAULT_BG, text: DEFAULT_TEXT } },
    ocean:  { name: 'Ocean',  palette: { primary: '#0ea5e9', secondary: '#22d3ee', accent: '#6366f1', bg: DEFAULT_BG, text: DEFAULT_TEXT } },
    retro:  { name: 'Retro',  palette: { primary: '#f97316', secondary: '#84cc16', accent: '#14b8a6', bg: DEFAULT_BG, text: DEFAULT_TEXT } },
    minimal:{ name: 'Minimal',palette: { primary: '#e5e7eb', secondary: '#cbd5e1', accent: '#94a3b8', bg: '#0b1220', text: '#0b1220' } },
    warm:   { name: 'Warm',   palette: { primary: '#f59e0b', secondary: '#ef4444', accent: '#fb7185', bg: DEFAULT_BG, text: DEFAULT_TEXT } },
    cool:   { name: 'Cool',   palette: { primary: '#22d3ee', secondary: '#6366f1', accent: '#0ea5e9', bg: DEFAULT_BG, text: DEFAULT_TEXT } },
  };
  let customScheme = { name: 'Custom', palette: { primary: '#22d3ee', secondary: '#0ea5e9', accent: '#f59e0b', bg: DEFAULT_BG, text: DEFAULT_TEXT } };

  // 统一字体清单（中文显示名 -> family 值）
  const AVAILABLE_FONTS = [
    { label: 'sans-serif（系统无衬线）', family: 'sans-serif' },
    { label: 'serif（系统衬线）', family: 'serif' },
    { label: 'monospace（等宽）', family: 'monospace' },
    { label: 'Arial', family: 'Arial' },
    { label: 'Verdana', family: 'Verdana' },
    { label: '微软雅黑', family: 'Microsoft YaHei' },
    { label: '宋体', family: 'SimSun' },
    { label: '黑体', family: 'SimHei' },
    { label: '楷体', family: 'KaiTi' },
    { label: '仿宋', family: 'FangSong' },
    { label: '等线', family: 'DengXian' },
    { label: '苹方', family: 'PingFang SC' },
    { label: '冬青黑体', family: 'Hiragino Sans GB' },
    { label: '思源黑体', family: 'Source Han Sans SC' },
    { label: '思源宋体', family: 'Source Han Serif SC' },
    { label: 'Noto 思源黑体', family: 'Noto Sans CJK SC' },
    { label: '文泉驿微米黑', family: 'WenQuanYi Micro Hei' },
  ];
  const customFontFamilies = new Set();

  function populateFontSelect(selectEl, mode) {
    if (!selectEl) return;
    const prev = selectEl.value;
    selectEl.innerHTML = '';
    const mk = (value, text) => { const o = document.createElement('option'); o.value = value; o.textContent = text; return o; };
    if (mode === 'global') selectEl.appendChild(mk('', '跟随系统（sans-serif）'));
    if (mode === 'row') selectEl.appendChild(mk('', '跟随全局'));
    for (const f of AVAILABLE_FONTS) selectEl.appendChild(mk(f.family, f.label));
    if (prev && Array.from(selectEl.options).some(o => o.value === prev)) selectEl.value = prev;
  }

  function populateAllRowFontSelects() {
    if (!els.wordTableBody) return;
    const rows = els.wordTableBody.querySelectorAll('tr');
    rows.forEach(r => {
      const sel = r.querySelector('td:nth-child(3) select');
      if (sel) populateFontSelect(sel, 'row');
    });
  }

  // --- Color utils & WCAG ---
  function parseColor(str) {
    if (!str) return null;
    const s = String(str).trim().toLowerCase();
    const mhex = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (mhex) {
      let h = mhex[1];
      if (h.length === 3) h = h.split('').map(c => c + c).join('');
      const n = parseInt(h, 16);
      return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    }
    const mrgb = s.match(/^rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
    if (mrgb) return { r: +mrgb[1], g: +mrgb[2], b: +mrgb[3] };
    const mhsl = s.match(/^hsl\s*\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)%\s*,\s*(\d+(?:\.\d+)?)%\s*\)$/);
    if (mhsl) {
      const h = +mhsl[1], sPerc = +mhsl[2], lPerc = +mhsl[3];
      return hslToRgb(h, sPerc / 100, lPerc / 100);
    }
    return null;
  }
  function rgbToHex({ r, g, b }) { const to2 = x => x.toString(16).padStart(2, '0'); return `#${to2(r)}${to2(g)}${to2(b)}`; }
  function rgbToHsl({ r, g, b }) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) { h = s = 0; }
    else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) { case r: h = (g - b) / d + (g < b ? 6 : 0); break; case g: h = (b - r) / d + 2; break; case b: h = (r - g) / d + 4; break; }
      h /= 6;
    }
    return { h: Math.round(h * 360), s, l };
  }
  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360; s = Math.max(0, Math.min(1, s)); l = Math.max(0, Math.min(1, l));
    const c = (1 - Math.abs(2 * l - 1)) * s; const x = c * (1 - Math.abs(((h / 60) % 2) - 1)); const m = l - c / 2; let r1 = 0, g1 = 0, b1 = 0;
    if (h < 60) { r1 = c; g1 = x; } else if (h < 120) { r1 = x; g1 = c; } else if (h < 180) { g1 = c; b1 = x; }
    else if (h < 240) { g1 = x; b1 = c; } else if (h < 300) { r1 = x; b1 = c; } else { r1 = c; b1 = x; }
    return { r: Math.round((r1 + m) * 255), g: Math.round((g1 + m) * 255), b: Math.round((b1 + m) * 255) };
  }
  function relativeLuminance({ r, g, b }) { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); }
  function contrastRatio(c1, c2) { const L1 = relativeLuminance(c1); const L2 = relativeLuminance(c2); const hi = Math.max(L1, L2), lo = Math.min(L1, L2); return (hi + 0.05) / (lo + 0.05); }
  function ensureContrast(hex, bgHex = DEFAULT_BG, minRatio = 4.5) {
    const bg = parseColor(bgHex); let c = parseColor(hex); if (!bg || !c) return hex; let ratio = contrastRatio(c, bg); if (ratio >= minRatio) return rgbToHex(c);
    const hsl = rgbToHsl(c); const bgLum = relativeLuminance(bg); const increase = bgLum < 0.4; let step = 0;
    while (ratio < minRatio && step < 20) { hsl.l = Math.max(0, Math.min(1, hsl.l + (increase ? 0.03 : -0.03))); c = hslToRgb(hsl.h, hsl.s, hsl.l); ratio = contrastRatio(c, bg); step++; }
    return rgbToHex(c);
  }

  const cp = { open: false, targetColor: null, targetHex: null, h: 0, s: 1, v: 1 };
  let cpSV, cpHue, cpSVCtx, cpHueCtx, cpOverlay, cpPanel, cpInputs;
  function rgbToHexStr(r, g, b) { const to = (n)=> n.toString(16).padStart(2,'0'); return `#${to(r)}${to(g)}${to(b)}`.toUpperCase(); }
  function hexToRgbObj(hex) { const m = /^#?([0-9a-fA-F]{6})$/.exec(String(hex||'').trim()); if (!m) return null; const n = parseInt(m[1],16); return { r:(n>>16)&255, g:(n>>8)&255, b:n&255 }; }
  function hsvToRgb(h,s,v){ let f=(n,k=(n+h/60)%6)=>v - v*s*Math.max(Math.min(k,4-k,1),0); return { r:Math.round(f(5)*255), g:Math.round(f(3)*255), b:Math.round(f(1)*255) }; }
  function rgbToHsv(r,g,b){ r/=255;g/=255;b/=255; let mx=Math.max(r,g,b), mn=Math.min(r,g,b), d=mx-mn, h=0; if(d){ if(mx===r) h=((g-b)/d)%6; else if(mx===g) h=(b-r)/d+2; else h=(r-g)/d+4; h*=60; } let s= mx? d/mx:0; return { h:(h+360)%360, s, v:mx }; }
  function drawHue(){ if(!cpHueCtx) return; const h=cpHue.height, w=cpHue.width; const grd=cpHueCtx.createLinearGradient(0,0,0,h); for(let i=0;i<=360;i+=10){ const {r,g,b}=hsvToRgb(i,1,1); grd.addColorStop(i/360,`rgb(${r},${g},${b})`);} cpHueCtx.fillStyle=grd; cpHueCtx.fillRect(0,0,w,h); }
  function drawSV(){ if(!cpSVCtx) return; const w=cpSV.width, h=cpSV.height; const base=hsvToRgb(cp.h,1,1); const grdX=cpSVCtx.createLinearGradient(0,0,w,0); grdX.addColorStop(0,'#fff'); grdX.addColorStop(1,`rgb(${base.r},${base.g},${base.b})`); cpSVCtx.fillStyle=grdX; cpSVCtx.fillRect(0,0,w,h); const grdY=cpSVCtx.createLinearGradient(0,0,0,h); grdY.addColorStop(0,'rgba(0,0,0,0)'); grdY.addColorStop(1,'#000'); cpSVCtx.fillStyle=grdY; cpSVCtx.fillRect(0,0,w,h); }
  function updatePreviews(){ const {r,g,b}=hsvToRgb(cp.h,cp.s,cp.v); const hex=rgbToHexStr(r,g,b); const curBox = cpPanel?.querySelector('.cp-new'); if(curBox) curBox.style.background=hex; if(cpInputs){ cpInputs.hex.value=hex.replace('#',''); cpInputs.R.value=r; cpInputs.G.value=g; cpInputs.B.value=b; cpInputs.H.value=Math.round(cp.h); cpInputs.S.value=Math.round(cp.s*100); cpInputs.V.value=Math.round(cp.v*100); } }
  function openPicker(colorInput, hexInput){ cp.targetColor=colorInput; cp.targetHex=hexInput; const curRGB = hexToRgbObj(hexInput?.value||colorInput?.value)||{r:34,g:211,b:238}; const hsv=rgbToHsv(curRGB.r,curRGB.g,curRGB.b); cp.h=hsv.h; cp.s=hsv.s; cp.v=hsv.v; const curBox = cpPanel?.querySelector('.cp-current'); if(curBox) curBox.style.background=rgbToHexStr(curRGB.r,curRGB.g,curRGB.b); drawHue(); drawSV(); updatePreviews(); cpOverlay?.classList.remove('hidden'); cpPanel?.classList.remove('hidden'); cp.open=true; }
  function closePicker(){ cpOverlay?.classList.add('hidden'); cpPanel?.classList.add('hidden'); cp.open=false; }
  function applyPicker(){
    const {r,g,b}=hsvToRgb(cp.h,cp.s,cp.v);
    const hex=rgbToHexStr(r,g,b);
    if (cp.targetColor) cp.targetColor.value=hex;
    if (cp.targetHex) cp.targetHex.value=hex;
    syncWordsFromTable();
    refreshWordColorsFromTable();
    const hasWords = (els.wordsInput?.value || '').trim().length > 0;
    if (hasWords) {
      if (els.fillMode && els.fillMode.value==='dense') els.generateBtn?.click();
      else if (placedWords && placedWords.length) renderCloud(placedWords);
    }
    closePicker();
  }
  function initColorPicker(){ cpOverlay=document.getElementById('cpOverlay'); cpPanel=document.getElementById('colorPicker'); cpSV=document.getElementById('cpSV'); cpHue=document.getElementById('cpHue'); if(!cpOverlay||!cpPanel||!cpSV||!cpHue) return; cpSVCtx=cpSV.getContext('2d'); cpHueCtx=cpHue.getContext('2d'); cpInputs={H:document.getElementById('cpH'),S:document.getElementById('cpS'),V:document.getElementById('cpV'),R:document.getElementById('cpR'),G:document.getElementById('cpG'),B:document.getElementById('cpB'),hex:document.getElementById('cpHex')}; document.getElementById('cpOk').addEventListener('click', applyPicker); document.getElementById('cpCancel').addEventListener('click', closePicker); cpOverlay.addEventListener('click', closePicker); document.addEventListener('keydown',(e)=>{ if(e.key==='Escape'&&cp.open) closePicker(); }); let dragSV=false, dragHue=false; cpSV.addEventListener('mousedown',(e)=>{ dragSV=true; const rect=cpSV.getBoundingClientRect(); const x=Math.max(0,Math.min(rect.width,e.clientX-rect.left)); const y=Math.max(0,Math.min(rect.height,e.clientY-rect.top)); cp.s=x/rect.width; cp.v=1-y/rect.height; updatePreviews(); }); window.addEventListener('mousemove',(e)=>{ if(!dragSV) return; const rect=cpSV.getBoundingClientRect(); const x=Math.max(0,Math.min(rect.width,e.clientX-rect.left)); const y=Math.max(0,Math.min(rect.height,e.clientY-rect.top)); cp.s=x/rect.width; cp.v=1-y/rect.height; updatePreviews(); }); window.addEventListener('mouseup',()=>{ dragSV=false; }); cpHue.addEventListener('mousedown',(e)=>{ dragHue=true; const rect=cpHue.getBoundingClientRect(); const y=Math.max(0,Math.min(rect.height,e.clientY-rect.top)); cp.h=(y/rect.height)*360; drawSV(); updatePreviews(); }); window.addEventListener('mousemove',(e)=>{ if(!dragHue) return; const rect=cpHue.getBoundingClientRect(); const y=Math.max(0,Math.min(rect.height,e.clientY-rect.top)); cp.h=(y/rect.height)*360; drawSV(); updatePreviews(); }); window.addEventListener('mouseup',()=>{ dragHue=false; }); cpInputs.H.addEventListener('input',()=>{ cp.h=Math.max(0,Math.min(360,Number(cpInputs.H.value)||0)); drawSV(); updatePreviews(); }); cpInputs.S.addEventListener('input',()=>{ cp.s=Math.max(0,Math.min(1,(Number(cpInputs.S.value)||0)/100)); updatePreviews(); }); cpInputs.V.addEventListener('input',()=>{ cp.v=Math.max(0,Math.min(1,(Number(cpInputs.V.value)||0)/100)); updatePreviews(); }); const rgbInput=()=>{ const r=Math.max(0,Math.min(255,Number(cpInputs.R.value)||0)); const g=Math.max(0,Math.min(255,Number(cpInputs.G.value)||0)); const b=Math.max(0,Math.min(255,Number(cpInputs.B.value)||0)); const hsv=rgbToHsv(r,g,b); cp.h=hsv.h; cp.s=hsv.s; cp.v=hsv.v; drawSV(); updatePreviews(); }; cpInputs.R.addEventListener('input',rgbInput); cpInputs.G.addEventListener('input',rgbInput); cpInputs.B.addEventListener('input',rgbInput); cpInputs.hex.addEventListener('input',()=>{ const rgb=hexToRgbObj('#'+cpInputs.hex.value); if(!rgb) return; const hsv=rgbToHsv(rgb.r,rgb.g,rgb.b); cp.h=hsv.h; cp.s=hsv.s; cp.v=hsv.v; drawSV(); updatePreviews(); }); const table=els.wordTableBody; if(table){ table.addEventListener('click',(e)=>{ const t=e.target; if(t&&t.matches('td:nth-child(2) input[type="color"]')){ e.preventDefault(); e.stopPropagation(); const td=t.closest('td'); const hex=td.querySelector('.hex-input'); openPicker(t,hex); } if(t&&t.matches('td:nth-child(2) .hex-input')){ const color=t.closest('td').querySelector('input[type="color"]'); openPicker(color,t); } }); }
  }
  function glyphKey(text, fontFamily, fontSize, deg) {
    return `${text}\u0001${fontFamily}\u0001${fontSize}\u0001${deg}`;
  }
  function putGlyphCache(key, val) {
    if (!glyphCache.has(key)) glyphOrder.push(key);
    glyphCache.set(key, val);
    while (glyphOrder.length > MAX_GLYPH_CACHE) {
      const k = glyphOrder.shift(); glyphCache.delete(k);
    }
  }
  function getGlyphCached(text, fontFamily, fontSize, deg) {
    const key = glyphKey(text, fontFamily, fontSize, deg);
    const hit = glyphCache.get(key);
    if (hit) return hit;
    const g = rasterizeGlyph(text, fontFamily, fontSize, deg);
    putGlyphCache(key, g);
    return g;
  }

  async function loadAppConfig() {
    try {
      const res = await fetch('config.json', { cache: 'no-store' });
      if (!res.ok) return;
      const cfg = await res.json();
      const f = cfg.font || cfg;
      const minCandidate = Number(f.minFontSize ?? f.minFont ?? appConfig.font.minFontSize);
      const maxCandidate = Number(f.maxFontSize ?? f.maxFont ?? appConfig.font.maxFontSize);
      appConfig.font.minFontSize = isNaN(minCandidate) ? 16 : minCandidate;
      appConfig.font.maxFontSize = isNaN(maxCandidate) ? 96 : maxCandidate;
    } catch (_) { /* ignore missing config.json */ }
  }

  function applyConfigToUI() {
    if (els.minFont) els.minFont.value = String(appConfig.font.minFontSize);
    if (els.maxFont) els.maxFont.value = String(appConfig.font.maxFontSize);
  }

  function updateFontError(msg) {
    if (!els.fontError) return;
    els.fontError.textContent = msg || '';
  }

  function alignStep16(n) { return Math.max(LIMITS.MIN, Math.min(LIMITS.MAX, Math.round(n / STEP16) * STEP16)); }

  function autoMaxByCanvas() {
    const base = Math.floor(Math.min(els.cloudCanvas.width, els.cloudCanvas.height) * 0.3);
    return alignStep16(Math.max(16, base));
  }

  // 验证并返回用于算法的有效字号范围；允许0表示不限制
  function sanitizeFontRange(min, max, alertOnError) {
    const rawMin = Number(min);
    const rawMax = Number(max);
    // 默认值（新实例）
    const defMin = 16;
    const defMax = 96;
    let msg = '';

    if (isNaN(rawMin) || isNaN(rawMax)) {
      msg = '请输入有效数字（可为0表示不限制）';
    } else if (rawMin < 0 || rawMax < 0) {
      msg = '字号不能为负数；设置为0可取消限制';
    } else if (rawMin !== 0 && rawMax !== 0 && rawMin > rawMax) {
      msg = '最小字号不能大于最大字号；如需取消限制请将其中之一设为0';
    }

    if (msg) {
      updateFontError(msg);
      if (alertOnError) alert(msg);
    } else {
      updateFontError('');
    }

    // 计算供算法使用的有效范围（不改变输入框值）
    const miCandidate = (isNaN(rawMin) ? defMin : rawMin);
    const maCandidate = (isNaN(rawMax) ? defMax : rawMax);
    const miEff = miCandidate === 0 ? LIMITS.MIN : miCandidate; // 下限不限制时仍给算法最小值
    const maEff = maCandidate === 0 ? autoMaxByCanvas() : maCandidate; // 上限不限制时按画布自动估算
    const miAligned = alignStep16(miEff);
    const maAligned = alignStep16(maEff);
    return { min: miAligned, max: maAligned, rawMin: miCandidate, rawMax: maCandidate };
  }

  function getFontRange(alertOnError = false) {
    const s = sanitizeFontRange(els.minFont?.value, els.maxFont?.value, alertOnError);
    // 保留用户的原始配置（包含0表示不限制）
    appConfig.font.minFontSize = Number(els.minFont?.value ?? 16);
    appConfig.font.maxFontSize = Number(els.maxFont?.value ?? 96);
    return s;
  }

  // Helpers
  const DEFAULT_STOPWORDS = ['的','了','和','与','在','是','就','也','都','而','及','被','并','或','一个','我们','你们','他们'];
  function parseWords(text) {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const explicit = [];
    for (const l of lines) {
      const parts = l.split(',');
      const word = parts[0].trim();
      const wRaw = parts[1] ? Number(parts[1]) : NaN;
      const weight = isNaN(wRaw) ? null : wRaw;
      explicit.push({ text: word, weight });
    }
    const swInput = (els.stopwords?.value || '').trim();
    const sw = swInput ? swInput.split(/[,\s]+/).map(s => s.trim()).filter(Boolean) : DEFAULT_STOPWORDS;
    const swSet = new Set(sw.map(s => s.toLowerCase()));
    const agg = new Map();
    const auto = els.autoWeight ? !!els.autoWeight.checked : true;
    for (const item of explicit) {
      const key = item.text.trim();
      if (!key) continue;
      if (swSet.has(key.toLowerCase())) continue;
      const prev = agg.get(key) || 0;
      const delta = item.weight == null ? 1 : item.weight;
      const next = auto ? prev + delta : (item.weight == null ? (prev + 1) : (prev + item.weight));
      agg.set(key, next);
    }
    const words = Array.from(agg.entries()).map(([text, weight]) => ({ text, weight: Math.max(1, Number(weight) || 1) }));
    const maxW = words.reduce((m, w) => Math.max(m, w.weight), 1);
    const minW = words.reduce((m, w) => Math.min(m, w.weight), maxW);
    return words.map(w => ({ ...w, norm: (w.weight - minW) / (maxW - minW || 1), color: wordColors.get(w.text) || null }));
  }

  function pickColor(scheme, i, total) {
    const t = total > 1 ? i / (total - 1) : 0.5;
    const s = scheme === 'custom' ? customScheme : (SCHEMES[scheme] || SCHEMES.bright);
    const { primary, secondary, accent, bg } = s.palette;
    const stops = [primary, secondary, accent].map(hex => parseColor(hex));
    function lerp(a, b, u) { return { r: Math.round(a.r + (b.r - a.r) * u), g: Math.round(a.g + (b.g - a.g) * u), b: Math.round(a.b + (b.b - a.b) * u) }; }
    let c; if (t < 0.5) c = lerp(stops[0], stops[1], t * 2); else c = lerp(stops[1], stops[2], (t - 0.5) * 2);
    const hex = rgbToHex(c); return ensureContrast(hex, bg, 4.5);
  }

  function pickColorWithOverride(word, scheme, i, total) {
    const ov = wordColors.get(word);
    if (ov) return ensureContrast(ov, getComputedStyle(document.documentElement).getPropertyValue('--wc-bg').trim() || DEFAULT_BG);
    return pickColor(scheme, i, total);
  }

  function applyThemeFromScheme(schemeKey) {
    const s = schemeKey === 'custom' ? customScheme : (SCHEMES[schemeKey] || SCHEMES.bright);
    const p = s.palette; const root = document.documentElement.style;
    root.setProperty('--wc-bg', p.bg || DEFAULT_BG);
    root.setProperty('--wc-text', p.text || DEFAULT_TEXT);
    root.setProperty('--wc-primary', ensureContrast(p.primary, p.bg));
    root.setProperty('--wc-secondary', ensureContrast(p.secondary, p.bg));
    root.setProperty('--wc-accent', ensureContrast(p.accent, p.bg));
  }

  // --- Custom Color UI ---
  function renderCustomPreview() {
    if (!els.customPreview) return;
    const p = customScheme.palette;
    els.customPreview.innerHTML = '';
    const mk = (hex, label) => {
      const d = document.createElement('div');
      d.className = 'color-chip'; d.title = label;
      d.style.background = ensureContrast(hex, p.bg);
      d.style.borderColor = '#334155';
      return d;
    };
    els.customPreview.appendChild(mk(p.primary, '主色'));
    els.customPreview.appendChild(mk(p.secondary, '辅色'));
    els.customPreview.appendChild(mk(p.accent, '强调'));
  }
  function syncCustomInputsFromScheme() {
    const p = customScheme.palette;
    const safeHex = h => (parseColor(h) ? h : '#22d3ee');
    if (els.customPrimary) els.customPrimary.value = rgbToHex(parseColor(safeHex(p.primary)));
    if (els.customSecondary) els.customSecondary.value = rgbToHex(parseColor(safeHex(p.secondary)));
    if (els.customAccent) els.customAccent.value = rgbToHex(parseColor(safeHex(p.accent)));
    if (els.customPrimaryText) els.customPrimaryText.value = p.primary;
    if (els.customSecondaryText) els.customSecondaryText.value = p.secondary;
    if (els.customAccentText) els.customAccentText.value = p.accent;
    renderCustomPreview();
  }
  function updateCustomFromInputs() {
    const p = customScheme.palette;
    const get = (inp, txt) => {
      const s = (txt?.value || inp?.value || '').trim();
      const c = parseColor(s);
      return c ? rgbToHex(c) : (inp?.value || '#22d3ee');
    };
    p.primary = get(els.customPrimary, els.customPrimaryText);
    p.secondary = get(els.customSecondary, els.customSecondaryText);
    p.accent = get(els.customAccent, els.customAccentText);
    renderCustomPreview();
  }
  function addChip(listEl, schemeObj) {
    if (!listEl) return;
    const chip = document.createElement('div'); chip.className = 'chip'; chip.title = schemeObj.name;
    const sw = document.createElement('span'); sw.className = 'swatch'; sw.style.background = schemeObj.palette.primary;
    chip.appendChild(sw);
    const label = document.createElement('span'); label.textContent = schemeObj.name;
    chip.appendChild(label);
    chip.addEventListener('click', () => {
      customScheme = JSON.parse(JSON.stringify(schemeObj));
      syncCustomInputsFromScheme(); applyThemeFromScheme('custom');
      els.generateBtn?.click();
    });
    listEl.appendChild(chip);
  }

  const LS_KEYS = { fav: 'wcFavorites', hist: 'wcHistory' };
  function loadSchemes(key) {
    try {
      const s = localStorage.getItem(key); return s ? JSON.parse(s) : [];
    } catch (_) { return []; }
  }
  function saveSchemes(key, arr) { try { localStorage.setItem(key, JSON.stringify(arr).slice(0, 100000)); } catch (_) { /* ignore */ } }
  function refreshLists() {
    const favs = loadSchemes(LS_KEYS.fav);
    const hist = loadSchemes(LS_KEYS.hist);
    if (els.favoritesList) { els.favoritesList.innerHTML = ''; favs.forEach(s => addChip(els.favoritesList, s)); }
    if (els.historyList) { els.historyList.innerHTML = ''; hist.forEach(s => addChip(els.historyList, s)); }
  }
  function pushHistory(s) {
    const hist = loadSchemes(LS_KEYS.hist);
    hist.unshift(s); if (hist.length > 24) hist.pop(); saveSchemes(LS_KEYS.hist, hist); refreshLists();
  }

  // Bind color scheme select
  if (els.colorScheme) {
    els.colorScheme.addEventListener('change', () => {
      const key = els.colorScheme.value || 'bright';
      applyThemeFromScheme(key);
      pushHistory(key === 'custom' ? customScheme : (SCHEMES[key] || SCHEMES.bright));
      els.generateBtn?.click();
    });
    // initial apply
    applyThemeFromScheme(els.colorScheme.value || 'professional');
  }

  // Custom inputs events
  els.customPrimary?.addEventListener('input', updateCustomFromInputs);
  els.customSecondary?.addEventListener('input', updateCustomFromInputs);
  els.customAccent?.addEventListener('input', updateCustomFromInputs);
  els.customPrimaryText?.addEventListener('change', updateCustomFromInputs);
  els.customSecondaryText?.addEventListener('change', updateCustomFromInputs);
  els.customAccentText?.addEventListener('change', updateCustomFromInputs);

  els.applyCustomBtn?.addEventListener('click', () => {
    applyThemeFromScheme('custom'); pushHistory(customScheme); els.generateBtn?.click();
  });
  els.savePresetBtn?.addEventListener('click', () => {
    const name = (els.presetName?.value || '').trim() || `Preset ${new Date().toLocaleTimeString()}`;
    const s = { name, palette: { ...customScheme.palette } };
    const favs = loadSchemes(LS_KEYS.fav); favs.unshift(s); if (favs.length > 24) favs.pop(); saveSchemes(LS_KEYS.fav, favs); refreshLists();
  });
  els.favoriteAddBtn?.addEventListener('click', () => {
    const name = (els.presetName?.value || customScheme.name || 'Custom').trim(); const s = { name, palette: { ...customScheme.palette } };
    const favs = loadSchemes(LS_KEYS.fav); favs.unshift(s); if (favs.length > 24) favs.pop(); saveSchemes(LS_KEYS.fav, favs); refreshLists();
  });

  function addWordRow(text = '', color = '', focus = false) {
    if (!els.wordTableBody) return;
    const tr = document.createElement('tr');
    const tdWord = document.createElement('td');
    const tdColor = document.createElement('td');
    // color + hex in same cell
    const tdMin = document.createElement('td');
    const tdMax = document.createElement('td');
    const tdAct = document.createElement('td');
    const inpWord = document.createElement('input'); inpWord.type = 'text'; inpWord.value = text;
    const inpColor = document.createElement('input'); inpColor.type = 'color';
    const rowIndex = els.wordTableBody.querySelectorAll('tr').length;
    const palette = ROW_COLORS && ROW_COLORS.length >= 5 ? ROW_COLORS : ['#F59E0B', '#FFC566', '#FFE1B3', '#C07A08', '#8A5706'];
    const autoColor = palette[rowIndex % palette.length];
    const initColor = color && parseColor(color) ? rgbToHex(parseColor(color)).toUpperCase() : autoColor;
    inpColor.value = initColor;
    const inpHex = document.createElement('input'); inpHex.type = 'text'; inpHex.className = 'hex-input'; inpHex.placeholder = '#RRGGBB'; inpHex.value = initColor.toUpperCase();
    const tdFont = document.createElement('td');
    const selFont = document.createElement('select');
    populateFontSelect(selFont, 'row');
    const tdAngle = document.createElement('td');
    const inpAngle = document.createElement('input'); inpAngle.type = 'number'; inpAngle.className = 'num-input'; inpAngle.placeholder = ''; inpAngle.min = '-180'; inpAngle.max = '180';
    const inpMin = document.createElement('input'); inpMin.type = 'number'; inpMin.className = 'num-input'; inpMin.placeholder = '';
    const inpMax = document.createElement('input'); inpMax.type = 'number'; inpMax.className = 'num-input'; inpMax.placeholder = '';
    tdWord.appendChild(inpWord);
    const colorWrap = document.createElement('div'); colorWrap.className = 'cell-flex';
    colorWrap.appendChild(inpColor);
    colorWrap.appendChild(inpHex);
    tdColor.appendChild(colorWrap);
    tdFont.appendChild(selFont);
    tdAngle.appendChild(inpAngle);
    tdMin.appendChild(inpMin);
    tdMax.appendChild(inpMax);
    const btnDel = document.createElement('button'); btnDel.textContent = '删除';
    btnDel.className = 'btn-ghost';
    tdAct.className = 'row-actions'; tdAct.appendChild(btnDel);
    tr.appendChild(tdWord); tr.appendChild(tdColor); tr.appendChild(tdFont); tr.appendChild(tdMin); tr.appendChild(tdMax); tr.appendChild(tdAngle); tr.appendChild(tdAct);
    els.wordTableBody.appendChild(tr);
    const onChange = () => { syncWordsFromTable(); refreshWordColorsFromTable(); refreshWordBoundsFromTable(); refreshWordFontsFromTable(); refreshWordAnglesFromTable(); };
    inpWord.addEventListener('input', onChange);
    inpWord.addEventListener('change', onChange);
    inpColor.addEventListener('input', () => { inpHex.value = rgbToHex(parseColor(inpColor.value)).toUpperCase(); onChange(); });
    inpColor.addEventListener('change', () => { inpHex.value = rgbToHex(parseColor(inpColor.value)).toUpperCase(); onChange(); });
    inpHex.addEventListener('input', () => {
      const v = inpHex.value.trim().toUpperCase();
      if (/^#([0-9A-F]{6})$/.test(v)) { inpHex.style.borderColor = '#223'; inpColor.value = v; onChange(); }
      else { inpHex.style.borderColor = '#ef4444'; }
    });
    inpMin.addEventListener('input', onChange);
    inpMax.addEventListener('input', onChange);
    selFont.addEventListener('change', onChange);
    inpAngle.addEventListener('input', onChange);
    btnDel.addEventListener('click', () => { tr.remove(); onChange(); });
    if (focus) setTimeout(() => inpWord.focus(), 0);
  }

  function syncWordsFromTable() {
    if (!els.wordTableBody || !els.wordsInput) return;
    const lines = [];
    const rows = els.wordTableBody.querySelectorAll('tr');
    rows.forEach(r => {
      const w = r.querySelector('td:nth-child(1) input[type="text"]').value.trim();
      if (w) lines.push(w);
    });
    els.wordsInput.value = lines.join('\n');
  }

  function refreshWordColorsFromTable() {
    wordColors.clear();
    if (!els.wordTableBody) return;
    const rows = els.wordTableBody.querySelectorAll('tr');
    rows.forEach(r => {
      const w = r.querySelector('td:nth-child(1) input[type="text"]').value.trim();
      const c = r.querySelector('td:nth-child(2) input[type="color"]').value.trim();
      if (w && c) wordColors.set(w, c);
    });
  }

  function refreshWordBoundsFromTable() {
    wordFontBounds.clear();
    if (!els.wordTableBody) return;
    const rows = els.wordTableBody.querySelectorAll('tr');
    rows.forEach(r => {
      const w = r.querySelector('td:nth-child(1) input[type="text"]').value.trim();
      if (!w) return;
      const minRaw = Number(r.querySelector('td:nth-child(4) input')?.value || '');
      const maxRaw = Number(r.querySelector('td:nth-child(5) input')?.value || '');
      const min = isNaN(minRaw) || minRaw <= 0 ? undefined : minRaw;
      const max = isNaN(maxRaw) || maxRaw <= 0 ? undefined : maxRaw;
      if (min !== undefined || max !== undefined) wordFontBounds.set(w, { min, max });
    });
  }

  function refreshWordFontsFromTable() {
    wordFonts.clear();
    if (!els.wordTableBody) return;
    const rows = els.wordTableBody.querySelectorAll('tr');
    rows.forEach(r => {
      const w = r.querySelector('td:nth-child(1) input[type="text"]').value.trim();
      if (!w) return;
      const sel = r.querySelector('td:nth-child(3) select');
      const v = sel ? sel.value : '';
      if (v) wordFonts.set(w, v);
    });
  }

  function refreshWordAnglesFromTable() {
    wordAngles.clear();
    if (!els.wordTableBody) return;
    const rows = els.wordTableBody.querySelectorAll('tr');
    rows.forEach(r => {
      const w = r.querySelector('td:nth-child(1) input[type="text"]').value.trim();
      if (!w) return;
      const angRaw = r.querySelector('td:nth-child(6) input');
      if (!angRaw) return;
      const txt = String(angRaw.value || '').trim();
      if (txt === '') return; // 空值表示不覆盖全局
      const v = Number(txt);
      if (!isNaN(v)) wordAngles.set(w, clampAngle(v));
    });
  }

  function initWordTable() {
    if (!els.wordTableBody) return;
    if (!els.wordTableBody.children.length) {
      addWordRow('', '');
      addWordRow('', '');
      addWordRow('', '');
    }
    els.wordTableBody.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const target = e.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (target.type !== 'text') return;
      e.preventDefault();
      const rows = Array.from(els.wordTableBody.querySelectorAll('tr'));
      const currentRow = target.closest('tr');
      const isLast = rows[rows.length - 1] === currentRow;
      if (isLast && target.value.trim()) {
        addWordRow('', '', true);
      } else {
        const nextRow = rows[rows.indexOf(currentRow) + 1];
        const nextInput = nextRow?.querySelector('input[type="text"]');
        if (nextInput) nextInput.focus();
      }
      syncWordsFromTable();
      refreshWordColorsFromTable();
    });
    populateAllRowFontSelects();
    syncWordsFromTable();
    refreshWordColorsFromTable();
  }

  // boot UI
  syncCustomInputsFromScheme(); refreshLists();

function initGlobalFontSelect() {
  populateFontSelect(els.fontFamily, 'global');
  els.fontUploadInput = document.getElementById('fontUpload');
  if (els.uploadFontBtn) {
    els.uploadFontBtn.addEventListener('click', () => {
      const fi = document.getElementById('fontUpload');
      if (fi) fi.click();
    });
  }
  const fi = document.getElementById('fontUpload');
  if (fi && !fi.dataset.bound) {
    fi.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      await handleFontUpload(file);
      e.target.value = '';
    });
    fi.dataset.bound = '1';
  }
}

  function sanitizeFamilyName(name) {
    const base = String(name || '').replace(/\.(ttf|otf|woff2?|ttc)$/i, '');
    return base.replace(/[^\u4e00-\u9fa5\w\-\s]/g, '').trim() || '自定义字体';
  }

  async function handleFontUpload(file) {
    try {
      const buf = await file.arrayBuffer();
      const family = (() => {
        const n = sanitizeFamilyName(file.name);
        if (!customFontFamilies.has(n) && !AVAILABLE_FONTS.some(f => f.family === n)) return n;
        let k = 2; let c = `${n}-${k}`;
        while (customFontFamilies.has(c) || AVAILABLE_FONTS.some(f => f.family === c)) { k++; c = `${n}-${k}`; }
        return c;
      })();
      const font = new FontFace(family, buf);
      await font.load();
      document.fonts.add(font);
      customFontFamilies.add(family);
      AVAILABLE_FONTS.push({ label: family, family });
      populateFontSelect(els.fontFamily, 'global');
      populateAllRowFontSelects();
      if (placedWords && placedWords.length) fastRenderToFit();
    } catch (e) {
      console.error('字体加载失败', e);
      alert('字体加载失败');
    }
  }

  // 移至 initGlobalFontSelect 运行时绑定，避免初始化时元素尚未存在

  function measureText(word, fontSize, fontFamily) {
    cloudCtx.save();
    cloudCtx.font = `${fontSize}px ${fontFamily}`;
    const metrics = cloudCtx.measureText(word);
    cloudCtx.restore();
    const width = Math.ceil(metrics.width);
    const height = Math.ceil(fontSize); // approximate ascent+descent
    return { width, height };
  }

  // --- Rotation helpers ---
  function clampAngle(a) {
    const n = Number(a);
    if (isNaN(n)) return 0;
    return Math.max(-180, Math.min(180, n));
  }
  function getRotateConfig() {
    const mode = els.rotate?.value || 'random';
    const ang = clampAngle(els.rotateAngle?.value ?? 0);
    return { mode, angle: ang };
  }
  function pickRotateAngle(mode, angleInput) {
    switch (mode) {
      case 'random': return Math.random() * 180 - 90; // [-90,90]
      case 'custom': return clampAngle(angleInput);
      default: {
        const n = Number(mode);
        return isNaN(n) ? 0 : clampAngle(n);
      }
    }
  }
  function rotatedBounds(tw, th, deg) {
    const rad = deg * Math.PI / 180;
    const cw = Math.abs(Math.cos(rad));
    const sw = Math.abs(Math.sin(rad));
    const w = Math.ceil(tw * cw + th * sw);
    const h = Math.ceil(tw * sw + th * cw);
    return { w, h, rad };
  }
  // Render text into rotated bounds, extract tight alpha mask bbox
  function rasterizeGlyph(text, fontFamily, fontSize, deg) {
    const m = measureText(text, fontSize, fontFamily);
    const rb = rotatedBounds(m.width, m.height, deg);
    const w = Math.max(1, rb.w), h = Math.max(1, rb.h);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.save();
    ctx.font = `${fontSize}px ${fontFamily}`;
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.translate(w / 2, h / 2);
    ctx.rotate(deg * Math.PI / 180);
    ctx.fillText(text, 0, 0);
    ctx.restore();
    const img = ctx.getImageData(0, 0, w, h);
    const data = img.data;
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) {
      const base = y * w * 4;
      for (let x = 0; x < w; x++) {
        const a = data[base + x * 4 + 3];
        if (a > GLYPH_ALPHA_THRESHOLD) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) {
      return { rbw: w, rbh: h, offX: 0, offY: 0, bw: 1, bh: 1, mask: new Uint8Array(1), fontSize, deg };
    }
    const bw = Math.max(1, maxX - minX + 1);
    const bh = Math.max(1, maxY - minY + 1);
    const mask = new Uint8Array(bw * bh);
    for (let y = 0; y < bh; y++) {
      const sy = y + minY; const base = sy * w * 4;
      for (let x = 0; x < bw; x++) {
        const sx = x + minX; const a = data[base + sx * 4 + 3];
        mask[y * bw + x] = a > GLYPH_ALPHA_THRESHOLD ? 1 : 0;
      }
    }
    return { rbw: w, rbh: h, offX: minX, offY: minY, bw, bh, mask, fontSize, deg };
  }
  function syncRotateAngleInputState() {
    if (!els.rotate || !els.rotateAngle) return;
    const disabled = els.rotate.value !== 'custom';
    els.rotateAngle.disabled = disabled;
    if (disabled) els.rotateAngle.setAttribute('title', '请先选择自定义角度选项');
    else els.rotateAngle.removeAttribute('title');
    if (disabled) {
      els.rotateAngle.value = '';
      els.rotateAngle.placeholder = '';
    } else if (!els.rotateAngle.placeholder) {
      els.rotateAngle.placeholder = '请输入角度（0~360）';
    }
  }
  function applyRotateFromQuery() {
    const qs = new URLSearchParams(location.search);
    const m = qs.get('rotate');
    const a = qs.get('angle');
    if (m) { els.rotate.value = m; }
    if (a !== null && els.rotate.value === 'custom') {
      els.rotateAngle.value = String(clampAngle(a));
    }
  }

  function rectIntersects(a, b) {
    return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
  }

  function inBounds(x, y, w, h, W, H) {
    return x >= 0 && y >= 0 && x + w <= W && y + h <= H;
  }

  // --- Shape-level checks using glyph mask ---
  function shapeInsideMask(mask, W, H, rx, ry, glyph, stride = 1, pad = 0) {
    const bw = glyph.bw, bh = glyph.bh;
    const ox = rx + glyph.offX - pad;
    const oy = ry + glyph.offY - pad;
    const gw = bw + pad * 2; const gh = bh + pad * 2;
    if (!inBounds(ox, oy, gw, gh, W, H)) return false;
    const s = Math.max(1, stride);
    for (let y = 0; y < bh; y += s) {
      const gy = oy + y; const base = gy * W;
      for (let x = 0; x < bw; x += s) {
        if (!glyph.mask[y * bw + x]) continue;
        const gx = ox + x;
        if (!mask[base + gx]) return false;
      }
    }
    return true;
  }
  function shapeRegionFree(occ, W, H, rx, ry, glyph, stride = 2, pad = 0) {
    const bw = glyph.bw, bh = glyph.bh;
    const ox0 = rx + glyph.offX;
    const oy0 = ry + glyph.offY;
    const s = Math.max(1, stride);
    for (let y = 0; y < bh; y += s) {
      for (let x = 0; x < bw; x += s) {
        if (!glyph.mask[y * bw + x]) continue;
        // Check occupied around mask pixel within pad
        for (let dy = -pad; dy <= pad; dy++) {
          const gy = oy0 + y + dy; if (gy < 0 || gy >= H) continue;
          const base = gy * W;
          for (let dx = -pad; dx <= pad; dx++) {
            const gx = ox0 + x + dx; if (gx < 0 || gx >= W) continue;
            if (occ[base + gx]) return false;
          }
        }
      }
    }
    return true;
  }
  function stampShape(occ, W, H, rx, ry, glyph, pad = 0) {
    const bw = glyph.bw, bh = glyph.bh;
    const ox0 = rx + glyph.offX;
    const oy0 = ry + glyph.offY;
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        if (!glyph.mask[y * bw + x]) continue;
        // Stamp mask pixel plus dilation within pad
        for (let dy = -pad; dy <= pad; dy++) {
          const gy = oy0 + y + dy; if (gy < 0 || gy >= H) continue;
          const base = gy * W;
          for (let dx = -pad; dx <= pad; dx++) {
            const gx = ox0 + x + dx; if (gx < 0 || gx >= W) continue;
            occ[base + gx] = 1;
          }
        }
      }
    }
  }

  // --- Debug overlay ---
  function clearDebug() {
    if (!debugCtx || !els.debugCanvas) return;
    debugCtx.clearRect(0, 0, els.debugCanvas.width, els.debugCanvas.height);
  }
  function drawDebugBoxes(rx, ry, glyph, rbw, rbh) {
    if (!debugCtx || !els.debugOverlay || !els.debugOverlay.checked) return;
    debugCtx.save();
    debugCtx.strokeStyle = '#ff4444';
    debugCtx.lineWidth = 1; debugCtx.setLineDash([4, 3]);
    debugCtx.strokeRect(rx, ry, rbw, rbh);
    debugCtx.strokeStyle = '#22cc88'; debugCtx.setLineDash([3, 2]);
    debugCtx.strokeRect(rx + glyph.offX, ry + glyph.offY, glyph.bw, glyph.bh);
    debugCtx.restore();
  }

  function computeMaskFromImage(img, alphaThreshold) {
    const W = maskCanvas.width;
    const H = maskCanvas.height;
    // Fit image into mask canvas preserving aspect ratio
    const scale = Math.min(W / img.width, H / img.height);
    const drawW = Math.max(1, Math.floor(img.width * scale));
    const drawH = Math.max(1, Math.floor(img.height * scale));
    const dx = Math.floor((W - drawW) / 2);
    const dy = Math.floor((H - drawH) / 2);
    maskOffCtx.clearRect(0, 0, W, H);
    maskOffCtx.drawImage(img, dx, dy, drawW, drawH);
    const { data } = maskOffCtx.getImageData(0, 0, W, H);
    const mask = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const idx = (y * W + x) * 4;
        const a = data[idx + 3];
        // allow region if alpha above threshold
        mask[y * W + x] = a >= alphaThreshold ? 1 : 0;
      }
    }
    // Build binary mask canvas for compositing
    const bm = document.createElement('canvas');
    bm.width = W; bm.height = H;
    const bctx = bm.getContext('2d');
    const imgData = bctx.createImageData(W, H);
    for (let i = 0; i < W * H; i++) {
      const on = mask[i];
      const p = i * 4;
      imgData.data[p] = 255;
      imgData.data[p + 1] = 255;
      imgData.data[p + 2] = 255;
      imgData.data[p + 3] = on ? 255 : 0;
    }
    bctx.putImageData(imgData, 0, 0);
    binMaskCanvas = bm;
    return mask;
  }

  function renderMaskPreview(mask) {
    // Deprecated: keep for compatibility but use image-based preview
    if (sourceImage) {
      renderMaskPreviewFromImage(sourceImage, Number(els.alphaThreshold.value) || 128);
    }
  }

  function renderMaskPreviewFromImage(img, alphaThreshold) {
    const pw = 320, ph = 240;
    if (els.maskPreview.width !== pw || els.maskPreview.height !== ph) {
      els.maskPreview.width = pw; els.maskPreview.height = ph;
    }
    const ctx = maskCtx; ctx.clearRect(0, 0, pw, ph);
    const scale = Math.min(pw / img.width, ph / img.height);
    const drawW = Math.max(1, Math.floor(img.width * scale));
    const drawH = Math.max(1, Math.floor(img.height * scale));
    const dx = Math.floor((pw - drawW) / 2);
    const dy = Math.floor((ph - drawH) / 2);
    // draw image to offscreen then threshold
    const off = document.createElement('canvas'); off.width = drawW; off.height = drawH;
    const octx = off.getContext('2d'); octx.drawImage(img, 0, 0, drawW, drawH);
    const { data } = octx.getImageData(0, 0, drawW, drawH);
    const out = ctx.createImageData(pw, ph);
    // fill black
    for (let i = 0; i < pw * ph; i++) { const p = i * 4; out.data[p] = 0; out.data[p+1] = 0; out.data[p+2] = 0; out.data[p+3] = 255; }
    for (let y = 0; y < drawH; y++) {
      for (let x = 0; x < drawW; x++) {
        const srcA = data[(y * drawW + x) * 4 + 3];
        const val = srcA >= alphaThreshold ? 255 : 0;
        const px = (dy + y) * pw + (dx + x);
        const p = px * 4; out.data[p] = val; out.data[p+1] = val; out.data[p+2] = val; out.data[p+3] = 255;
      }
    }
    ctx.putImageData(out, 0, 0);
    console.info('[preview]', { src: { w: img.width, h: img.height, ratio: img.width / img.height }, preview: { w: pw, h: ph }, draw: { drawW, drawH, dx, dy } });
  }

  function rectInsideMask(mask, W, H, rx, ry, rw, rh, step) {
    if (!inBounds(rx, ry, rw, rh, W, H)) return false;
    const s = Math.max(1, step | 0);
    for (let y = ry; y < ry + rh; y += s) {
      for (let x = rx; x < rx + rw; x += s) {
        if (!mask[y * W + x]) return false;
      }
    }
    // also check the far edges in case of stride skipping
    for (let x = rx; x < rx + rw; x++) {
      if (!mask[(ry + rh - 1) * W + x]) return false;
    }
    for (let y = ry; y < ry + rh; y++) {
      if (!mask[y * W + (rx + rw - 1)]) return false;
    }
    return true;
  }

  // Dense fill helpers
  function tileInsideRatio(mask, W, H, rx, ry, size, stride = 2) {
    let total = 0, inside = 0;
    const xEnd = Math.min(W, rx + size);
    const yEnd = Math.min(H, ry + size);
    for (let y = ry; y < yEnd; y += stride) {
      for (let x = rx; x < xEnd; x += stride) {
        total++;
        if (mask[y * W + x]) inside++;
      }
    }
    return total ? inside / total : 0;
  }

  function createVariants(words, repeatFactor, minF, maxF, fontFamily, rotateMode, rotateAngle) {
    const variants = [];
    for (const w of words) {
      for (let i = 0; i < repeatFactor; i++) {
        const base = minF + (maxF - minF) * (Math.random() * 0.8 + 0.2) * (0.6 + 0.4 * w.norm);
        const fontSize = Math.round(Math.max(minF, Math.min(maxF, base)));
        const rotate = pickRotateAngle(rotateMode, rotateAngle);
        variants.push({ text: w.text, fontSize, fontFamily, rotate, weight: w.weight });
      }
    }
    // If no words provided, use placeholder
    if (!variants.length) variants.push({ text: '词', fontSize: minF, fontFamily, rotate: 0, weight: 1 });
    return variants;
  }

  // Build adaptive size buckets using geometric progression between [maxF, minF]
  // Ensures smooth decrement without jumping from max directly to min.
  function buildSizeBuckets(maxF, minF) {
    const hi = Math.max(minF, maxF);
    const lo = Math.max(8, Math.min(minF, maxF));
    const ratio = hi / lo;
    // Number of tiers based on range breadth, clamped for visual balance
    const tiers = Math.max(5, Math.min(12, Math.round(4 + Math.log2(ratio) * 2)));
    const sizes = [];
    for (let i = 0; i < tiers; i++) {
      const t = i / (tiers - 1);
      const s = Math.round(hi * Math.pow(lo / hi, t));
      if (!sizes.length || sizes[sizes.length - 1] !== s) sizes.push(s);
    }
    if (sizes[sizes.length - 1] !== lo) sizes.push(lo);
    // Repeat counts bias: larger tiers fewer repeats, smaller tiers more
    return sizes.map((s, i) => {
      const t = i / (sizes.length - 1);
      const base = Math.round(2 + (1 - t) * 6); // max size≈2, min size≈8
      return { size: s, count: base };
    });
  }

  // Estimate capacity for a given step by counting mask-friendly tiles
  function estimateBucketCapacity(mask, W, H, step) {
    let tiles = 0;
    for (let y = 0; y < H; y += step) {
      for (let x = 0; x < W; x += step) {
        const r = tileInsideRatio(mask, W, H, x, y, step, 2);
        if (r >= 0.55) tiles++;
      }
    }
    return tiles;
  }

  function tierRepeatBase(size, minF, maxF) {
    const t = (size - minF) / Math.max(1, (maxF - minF));
    return Math.round(2 + (1 - t) * 6); // 2..8
  }

  function estimateTopStep(maxF) {
    return Math.max(6, Math.floor(maxF * (maxF >= 96 ? 1.1 : 0.9)));
  }

  function computeTopRepeats(words, cfg, mask, W, H, restrictTop = true) {
    const maxF = cfg.maxFont;
    const minF = cfg.minFont;
    const stepTop = estimateTopStep(maxF);
    let capTop = 0;
    if (mask) capTop = estimateBucketCapacity(mask, W, H, stepTop);
    else {
      const gx = Math.max(1, Math.floor(W / stepTop));
      const gy = Math.max(1, Math.floor(H / stepTop));
      capTop = Math.floor(gx * gy * 0.55);
    }
    const baseRepeat = tierRepeatBase(maxF, minF, maxF);
    const counts = new Map();
    // 默认全部至少1次
    for (const w of words) counts.set(w.text, 1);
    // 仅对TopK分配重复，避免被长尾词稀释
    const topK = restrictTop ? Math.max(1, Math.min(3, Math.ceil(words.length * 0.1))) : words.length;
    let desired = 0;
    const desiredPer = new Array(topK);
    for (let i = 0; i < topK; i++) {
      const w = words[i];
      const d = Math.max(2, Math.round(baseRepeat * (0.5 + 0.5 * (w.norm ?? 1))));
      desiredPer[i] = d;
      desired += d;
    }
    const scale = desired > 0 ? Math.min(1, Math.max(0.25, capTop / desired)) : 1;
    let total = words.length; // 已经各1次
    for (let i = 0; i < topK; i++) {
      const w = words[i];
      const c = Math.max(2, Math.min(8, Math.round(desiredPer[i] * scale)));
      counts.set(w.text, c);
      total += (c - 1);
    }
    if (total > 2000) {
      const s2 = 2000 / total;
      for (let i = 0; i < topK; i++) {
        const w = words[i];
        const base = Math.max(2, Math.min(8, Math.round(desiredPer[i] * scale)));
        const c = Math.max(2, Math.min(8, Math.round(base * s2)));
        counts.set(w.text, c);
      }
    }
    return counts;
  }

  function farEnough(list, cx, cy, size, factor = 1.2) {
    if (!list || !list.length) return true;
    const dmin = Math.max(6, Math.floor(size * factor));
    for (const p of list) {
      const dx = cx - p.x;
      const dy = cy - p.y;
      if (dx * dx + dy * dy <= dmin * dmin) return false;
    }
    return true;
  }

  function distributeRepeatsByBuckets(words, minF, maxF, mask, W, H) {
    const buckets = buildSizeBuckets(maxF, minF);
    const topText = words[0]?.text;
    const layers = [];
    for (let bi = 0; bi < buckets.length; bi++) {
      const b = buckets[bi];
      const step = estimateTopStep(b.size);
      let cap = 0;
      if (mask) cap = estimateBucketCapacity(mask, W, H, step);
      else {
        const gx = Math.max(1, Math.floor(W / step));
        const gy = Math.max(1, Math.floor(H / step));
        cap = Math.floor(gx * gy * 0.55);
      }
      const baseR = tierRepeatBase(b.size, minF, maxF);
      let desired = 0;
      const desiredPer = new Array(words.length);
      for (let i = 0; i < words.length; i++) {
        const w = words[i];
        const d = Math.max(1, Math.round(baseR * (0.4 + 0.6 * ((w.norm ?? 0)))));
        desiredPer[i] = d;
        desired += d;
      }
      const scale = desired > 0 ? Math.min(1, cap / desired) : 1;
      const instances = [];
      for (let i = 0; i < words.length; i++) {
        let c = Math.max(1, Math.round(desiredPer[i] * scale));
        if (bi === 0 && words[i].text === topText) c = Math.max(2, c);
        for (let k = 0; k < Math.min(c, 512); k++) {
          if (instances.length >= cap) break;
          const w = words[i];
          instances.push({ text: w.text, weight: w.weight, norm: w.norm, fontSize: b.size });
        }
      }
      layers.push({ size: b.size, instances });
    }
    return layers;
  }

  // Adaptive variants for a single bucket, scaled by capacity and word weights
  function createVariantsByBucketAdaptive(words, bucketSize, fontFamily, rotateMode, rotateAngle, minF, maxF, capacityTiles) {
    const variants = [];
    const baseRepeat = tierRepeatBase(bucketSize, minF, maxF);
    const desired = words.map(w => Math.max(1, Math.round(baseRepeat * (0.4 + 0.6 * (w.norm ?? 0)))));
    const desiredTotal = desired.reduce((a, b) => a + b, 0);
    const scale = desiredTotal > 0 ? Math.min(1, capacityTiles / desiredTotal) : 1;
    const remaining = words.map((w, i) => Math.max(1, Math.round(desired[i] * scale)));
    let left = remaining.reduce((a, b) => a + b, 0);
    while (left > 0) {
      for (let i = 0; i < words.length && left > 0; i++) {
        if (remaining[i] > 0) {
          remaining[i]--;
          left--;
          const w = words[i];
          const override = wordAngles.get(w.text);
          const rotate = (override !== undefined) ? clampAngle(override) : pickRotateAngle(rotateMode, rotateAngle);
          const bounds = wordFontBounds.get(w.text) || {};
          const clampedSize = Math.max(bounds.min ?? minF, Math.min(bucketSize, bounds.max ?? maxF));
          const ff = wordFonts.get(w.text) || fontFamily;
          variants.push({ text: w.text, fontSize: clampedSize, fontFamily: ff, rotate, weight: w.weight, minForWord: bounds.min, maxForWord: bounds.max });
        }
      }
    }
    if (!variants.length) variants.push({ text: '词', fontSize: Math.max(minF, bucketSize), fontFamily, rotate: 0, weight: 1 });
    return variants;
  }

  function regionFree(occ, W, H, rx, ry, rw, rh, stride = 2) {
    if (!inBounds(rx, ry, rw, rh, W, H)) return false;
    for (let y = ry; y < ry + rh; y += stride) {
      for (let x = rx; x < rx + rw; x += stride) {
        if (occ[y * W + x]) return false;
      }
    }
    return true;
  }

  function markRegion(occ, W, H, rx, ry, rw, rh) {
    const yEnd = Math.min(H, ry + rh);
    const xEnd = Math.min(W, rx + rw);
    for (let y = ry; y < yEnd; y++) {
      const base = y * W;
      for (let x = rx; x < xEnd; x++) {
        occ[base + x] = 1;
      }
    }
  }

function denseFillPass(ctx, W, H, mask, variants, step, colorScheme, occ, minF, minScaleWithinBucket, sameWordDistanceFactor, placements) {
    let idx = 0;
    const pad = Math.max(1, Math.floor(step * 0.08));
    const placedByText = new Map();
    const minScale = typeof minScaleWithinBucket === 'number' ? Math.max(0.5, Math.min(1, minScaleWithinBucket)) : 1.0;
    const sameWordFactor = typeof sameWordDistanceFactor === 'number' ? sameWordDistanceFactor : 1.0;
    for (let y = 0; y < H; y += step) {
      for (let x = 0; x < W; x += step) {
        const ratio = tileInsideRatio(mask, W, H, x, y, step, 2);
        if (ratio < 0.55) continue;
        const v = variants[idx++ % variants.length];
        let size = Math.max(minF, Math.min(step - pad * 2, v.fontSize));
        let attempts = 5;
        let placed = false;
        while (attempts-- > 0 && size >= minF) {
          // scale glyph to fit tile
          let g0 = getGlyphCached(v.text, v.fontFamily, size, v.rotate);
          const avail = step - pad * 2;
          const scaleW = avail / (g0.rbw + 1);
          const scaleH = avail / (g0.rbh + 1);
          const scale = Math.min(scaleW, scaleH, 1);
          const wordMin = v.minForWord ?? minF;
          const wordMax = v.maxForWord ?? Infinity;
          const minAllowed = Math.max(minF, wordMin, Math.floor(v.fontSize * minScale));
          const adjSize = Math.min(wordMax, Math.max(minAllowed, Math.floor(size * scale)));
          if (adjSize < minF) { fontViolationCount++; break; }
          const g = getGlyphCached(v.text, v.fontFamily, adjSize, v.rotate);
          const rw = g.rbw;
          const rh = g.rbh;
          // center inside the tile, with slight jitter
          const jx = Math.floor((Math.random() - 0.5) * pad);
          const jy = Math.floor((Math.random() - 0.5) * pad);
          const rx = Math.max(0, Math.min(W - rw, x + Math.floor((step - rw) / 2) + jx));
          const ry = Math.max(0, Math.min(H - rh, y + Math.floor((step - rh) / 2) + jy));

          if (!shapeInsideMask(mask, W, H, rx, ry, g, Math.max(1, Math.floor(adjSize / 5)), 1)) {
            if (adjSize <= minAllowed) { fontViolationCount++; break; }
            size = Math.max(minF, Math.floor(adjSize * 0.9));
            continue;
          }
          if (!shapeRegionFree(occ, W, H, rx, ry, g, 2, 1)) {
            if (adjSize <= minAllowed) { fontViolationCount++; break; }
            size = Math.max(minF, Math.floor(adjSize * 0.9));
            continue;
          }
          const cx = rx + rw / 2;
          const cy = ry + rh / 2;
          const list = placedByText.get(v.text) || [];
          if (!farEnough(list, cx, cy, Math.max(rw, rh), sameWordFactor)) {
            if (adjSize <= minAllowed) { break; }
            size = Math.max(minAllowed, Math.floor(adjSize * 0.95));
            continue;
          }

          // draw
          ctx.save();
          ctx.font = `${adjSize}px ${v.fontFamily}`;
          ctx.fillStyle = pickColorWithOverride(v.text, colorScheme, (x + y) / step, Math.ceil((W / step) * (H / step)));
          ctx.textBaseline = 'middle';
          ctx.textAlign = 'center';
          ctx.translate(rx + rw / 2, ry + rh / 2);
          ctx.rotate(v.rotate * Math.PI / 180);
          ctx.globalAlpha = Math.max(0, Math.min(1, (Number(els.maskOpacity?.value) || 0) / 100));
          ctx.fillText(v.text, 0, 0);
          ctx.restore();

          stampShape(occ, W, H, rx, ry, g, 1);
          drawDebugBoxes(rx, ry, g, rw, rh);
          if (placements) {
            const colorUsed = pickColorWithOverride(v.text, colorScheme, (x + y) / step, Math.ceil((W / step) * (H / step)));
            placements.push({ text: v.text, weight: v.weight || 1, x: rx, y: ry, w: rw, h: rh, fontSize: adjSize, color: colorUsed, rotate: v.rotate, fontFamily: v.fontFamily });
          }
          list.push({ x: cx, y: cy }); if (list.length > 16) list.shift(); placedByText.set(v.text, list);
          placed = true;
          break;
        }
        // if not placed, skip; next layer will try finer tiles
      }
    }
  }

  // Try placing one word of a fixed size anywhere (not bounded by tile).
  function placeWordOnce(ctx, W, H, mask, occ, v, colorScheme) {
    const pad = 2;
    const maxTries = 1200;
    for (let t = 0; t < maxTries; t++) {
      const range = getFontRange(false);
      const minF = range.min;
      const size = Math.max(minF, v.fontSize);
      if (size < minF) { fontViolationCount++; return false; }
      const g = getGlyphCached(v.text, v.fontFamily, size, v.rotate);
      const rw = g.rbw;
      const rh = g.rbh;
      // Random center with slight bias to mask interior
      const cx = (Math.random() * 0.7 + 0.15) * W;
      const cy = (Math.random() * 0.7 + 0.15) * H;
      const rx = Math.max(0, Math.min(W - rw, Math.floor(cx - rw / 2)));
      const ry = Math.max(0, Math.min(H - rh, Math.floor(cy - rh / 2)));
      const stride = Math.max(1, Math.floor(size / 6));
      if (!shapeInsideMask(mask, W, H, rx, ry, g, stride, 1)) continue;
      if (!shapeRegionFree(occ, W, H, rx, ry, g, 2, 1)) continue;
      // draw
      ctx.save();
      ctx.font = `${size}px ${v.fontFamily}`;
      ctx.fillStyle = pickColorWithOverride(v.text, colorScheme, Math.random(), 1);
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.translate(rx + rw / 2, ry + rh / 2);
      ctx.rotate(v.rotate * Math.PI / 180);
      ctx.fillText(v.text, 0, 0);
      ctx.restore();
      stampShape(occ, W, H, rx, ry, g, 1);
      drawDebugBoxes(rx, ry, g, rw, rh);
      return true;
    }
    return false;
  }

  function applyMaskComposite(ctx, maskCanvasImage) {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(maskCanvasImage, 0, 0);
    ctx.restore();
  }

let maskOutlineCanvas = null;
function drawMaskUnderlay(ctx, W, H) {
  if (!binMaskCanvas) return;
  const t = Math.max(0, Math.min(1, (Number(els.maskOpacity?.value) || 0) / 100));
  // Outline only, black; alpha = 1 - t
  ctx.save();
  if (!maskOutlineCanvas || maskOutlineCanvas.width !== W || maskOutlineCanvas.height !== H) {
    maskOutlineCanvas = document.createElement('canvas');
    maskOutlineCanvas.width = W; maskOutlineCanvas.height = H;
  }
  const octx = maskOutlineCanvas.getContext('2d');
  const img = octx.createImageData(W, H);
  if (maskData) {
    const data = img.data;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (!maskData[i]) continue;
        const up = y > 0 ? maskData[i - W] : 0;
        const down = y < H - 1 ? maskData[i + W] : 0;
        const left = x > 0 ? maskData[i - 1] : 0;
        const right = x < W - 1 ? maskData[i + 1] : 0;
        if (!(up && down && left && right)) {
          const p = i * 4; data[p] = 255; data[p + 1] = 255; data[p + 2] = 255; data[p + 3] = 255;
        }
      }
    }
    octx.putImageData(img, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1 - t;
    ctx.drawImage(maskOutlineCanvas, 0, 0);
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

  function generateDenseFill(cfg) {
    const W = els.cloudCanvas.width;
    const H = els.cloudCanvas.height;
    try { cloudCtx.setTransform(1, 0, 0, 1, 0, 0); } catch (_) {}
    baseW = W; baseH = H; baseLocked = true;
    if (sourceImage) {
      try {
        maskCanvas.width = W; maskCanvas.height = H;
        maskData = computeMaskFromImage(sourceImage, Number(els.alphaThreshold?.value) || 128);
        maskOutlineCanvas = null;
      } catch (_) {}
    }
    // 构造全开掩码（无形状时）
    const M = maskData ? maskData : (() => { const a = new Uint8Array(W * H); a.fill(1); return a; })();
    fontViolationCount = 0; // reset monitor
    const words = parseWords(els.wordsInput.value);
    const buckets = buildSizeBuckets(cfg.maxFont, cfg.minFont);
    // clear canvas with transparent background (预览外层深色背景，导出保持透明)
    cloudCtx.clearRect(0, 0, W, H);
    clearDebug();
    const occ = new Uint8Array(W * H);
    drawMaskUnderlay(cloudCtx, W, H);
    const placements = [];
    // 顶层（最大字号）使用网格铺排，支持多次放置并自适应频率
    const maxBucketSize = buckets[0]?.size || cfg.maxFont;
    const stepTop = estimateTopStep(maxBucketSize);
    const capTop = estimateBucketCapacity(M, W, H, stepTop);
    const topVariants = createVariantsByBucketAdaptive(words, maxBucketSize, cfg.fontFamily, cfg.rotateMode, cfg.rotateAngle, cfg.minFont, cfg.maxFont, capTop);
    denseFillPass(cloudCtx, W, H, M, topVariants, stepTop, cfg.colorScheme, occ, cfg.minFont, 0.85, 0.9, placements);
    // 然后按字号从大到小分层网格填充，围绕大号字铺小号字
    for (let bi = 0; bi < buckets.length; bi++) {
      const b = buckets[bi];
      const step = estimateTopStep(b.size);
      const capTiles = estimateBucketCapacity(M, W, H, step);
      const groupVariants = createVariantsByBucketAdaptive(
        words, b.size, cfg.fontFamily, cfg.rotateMode, cfg.rotateAngle,
        cfg.minFont, cfg.maxFont, capTiles
      );
      denseFillPass(cloudCtx, W, H, M, groupVariants, step, cfg.colorScheme, occ, cfg.minFont, 1.0, 1.0, placements);
    }
    // 掩码裁剪，确保无溢出
    if (binMaskCanvas) applyMaskComposite(cloudCtx, binMaskCanvas);
    placedWords = placements;
  }

  function layoutWords(words, cfg) {
    const W = els.cloudCanvas.width;
    const H = els.cloudCanvas.height;
    const results = [];
    const occ = new Uint8Array(W * H);
    fontViolationCount = 0; // reset monitor
    const sorted = [...words].sort((a, b) => b.weight - a.weight);
    const minF = cfg.minFont;
    const maxF = cfg.maxFont;
    const rotateMode = cfg.rotateMode ?? 'random';
    const rotateAngle = cfg.rotateAngle ?? 0;
    const fontFamily = cfg.fontFamily;
    const colorScheme = cfg.colorScheme;
    const maxTries = 600;
    const placedByText = new Map();
    const layers = distributeRepeatsByBuckets(sorted, minF, maxF, maskData, W, H);
    let colorIndex = 0;
    for (let bi = 0; bi < layers.length; bi++) {
      const layer = layers[bi];
      const instances = layer.instances;
      for (let ii = 0; ii < instances.length; ii++) {
        const w = instances[ii];
        let fontSize = w.fontSize;
        const bounds = wordFontBounds.get(w.text) || {};
        fontSize = Math.max(bounds.min ?? cfg.minFont, Math.min(fontSize, bounds.max ?? cfg.maxFont));
        const ov = wordAngles.get(w.text);
        const angleDeg = (ov !== undefined) ? clampAngle(ov) : pickRotateAngle(rotateMode, rotateAngle);
        const ff = (wordFonts.get(w.text) || fontFamily);
        let g = getGlyphCached(w.text, ff, fontSize, angleDeg);
        let rw = g.rbw; let rh = g.rbh;
        for (let t = 0; t < maxTries; t++) {
          const cx = (Math.random() * 0.6 + 0.2) * W;
          const cy = (Math.random() * 0.6 + 0.2) * H;
          const rx = Math.max(0, Math.min(W - rw, Math.floor(cx - rw / 2)));
          const ry = Math.max(0, Math.min(H - rh, Math.floor(cy - rh / 2)));
          if (maskData) {
            if (!shapeInsideMask(maskData, W, H, rx, ry, g, Math.max(1, Math.floor(fontSize / 5)), 1)) continue;
          }
          if (!shapeRegionFree(occ, W, H, rx, ry, g, 2, 1)) continue;
          const cx2 = rx + rw / 2; const cy2 = ry + rh / 2;
          const list = placedByText.get(w.text) || [];
          const ok = farEnough(list, cx2, cy2, Math.max(rw, rh), list.length ? 1.0 : 1.2);
          if (!ok) {
            if (t % 80 === 79) {
              const ns = Math.max(bounds.min ?? minF, Math.floor(fontSize * 0.95));
              if (ns < fontSize) { fontSize = ns; g = getGlyphCached(w.text, fontFamily, fontSize, angleDeg); rw = g.rbw; rh = g.rbh; }
            }
            continue;
          }
          results.push({ text: w.text, weight: w.weight, x: rx, y: ry, w: rw, h: rh, fontSize, color: pickColorWithOverride(w.text, colorScheme, colorIndex++, instances.length), rotate: angleDeg, fontFamily: ff });
          stampShape(occ, W, H, rx, ry, g, 1);
          drawDebugBoxes(rx, ry, g, rw, rh);
          list.push({ x: cx2, y: cy2 }); if (list.length > 16) list.shift(); placedByText.set(w.text, list);
          break;
        }
      }
    }
    return results;
  }

  function layoutWordsSpiral(words, cfg) {
    const W = els.cloudCanvas.width;
    const H = els.cloudCanvas.height;
    const results = [];
    const occ = new Uint8Array(W * H);
    fontViolationCount = 0;
    const sorted = [...words].sort((a, b) => b.weight - a.weight);
    const minF = cfg.minFont;
    const maxF = cfg.maxFont;
    const rotateMode = cfg.rotateMode ?? 'random';
    const rotateAngle = cfg.rotateAngle ?? 0;
    const fontFamily = cfg.fontFamily;
    const colorScheme = cfg.colorScheme;
    const centerX = Math.floor(W / 2);
    const centerY = Math.floor(H / 2);
    const layers = distributeRepeatsByBuckets(sorted, minF, maxF, maskData, W, H);
    const placedByText = new Map();
    let colorIndex = 0;
    for (let bi = 0; bi < layers.length; bi++) {
      const layer = layers[bi];
      const instances = layer.instances;
      for (let ii = 0; ii < instances.length; ii++) {
        const w = instances[ii];
        let fontSize = w.fontSize;
        const bounds = wordFontBounds.get(w.text) || {};
        fontSize = Math.max(bounds.min ?? cfg.minFont, Math.min(fontSize, bounds.max ?? cfg.maxFont));
        const ov = wordAngles.get(w.text);
        const angleDeg = (ov !== undefined) ? clampAngle(ov) : pickRotateAngle(rotateMode, rotateAngle);
        const ff = (wordFonts.get(w.text) || fontFamily);
        let g = getGlyphCached(w.text, ff, fontSize, angleDeg);
        let rw = g.rbw; let rh = g.rbh;
        const step = Math.max(1, Math.floor(fontSize / 5));
        let placed = false;
        let r = Math.max(8, Math.floor(Math.min(W, H) * 0.02));
        const rMax = Math.max(W, H);
        const dTheta = 12 * Math.PI / 180;
        let theta = Math.random() * 2 * Math.PI;
        while (r < rMax && !placed) {
          const rx = Math.max(0, Math.min(W - rw, Math.floor(centerX + r * Math.cos(theta) - rw / 2)));
          const ry = Math.max(0, Math.min(H - rh, Math.floor(centerY + r * Math.sin(theta) - rh / 2)));
          if (!maskData || shapeInsideMask(maskData, W, H, rx, ry, g, step, 1)) {
            if (shapeRegionFree(occ, W, H, rx, ry, g, 2, 1)) {
              const cx = rx + rw / 2;
              const cy = ry + rh / 2;
              const list = placedByText.get(w.text) || [];
              const ok = farEnough(list, cx, cy, Math.max(rw, rh), list.length ? 1.0 : 1.2);
              if (!ok) { theta += dTheta; r += Math.max(2, Math.floor(step / 2)); continue; }
              results.push({ text: w.text, weight: w.weight, x: rx, y: ry, w: rw, h: rh, fontSize, color: pickColorWithOverride(w.text, colorScheme, colorIndex++, instances.length), rotate: angleDeg, fontFamily: ff });
              stampShape(occ, W, H, rx, ry, g, 1);
              drawDebugBoxes(rx, ry, g, rw, rh);
              list.push({ x: cx, y: cy }); if (list.length > 16) list.shift(); placedByText.set(w.text, list);
              placed = true;
              break;
            }
          }
          theta += dTheta; r += Math.max(2, Math.floor(step / 2));
        }
        if (!placed) fontViolationCount++;
      }
    }
    return results;
  }

  function renderCloud(words) {
    const W = els.cloudCanvas.width;
    const H = els.cloudCanvas.height;
    try { cloudCtx.setTransform(1, 0, 0, 1, 0, 0); } catch (_) {}
    if (!baseLocked) { baseW = W; baseH = H; baseLocked = true; console.info('[lock] base', { baseW, baseH }); }
    cloudCtx.save();
    cloudCtx.clearRect(0, 0, W, H);
    clearDebug();
    drawMaskUnderlay(cloudCtx, W, H);
    const t = Math.max(0, Math.min(1, (Number(els.maskOpacity?.value) || 0) / 100));
    for (const w of words) {
      cloudCtx.save();
      cloudCtx.font = `${w.fontSize}px ${w.fontFamily}`;
      cloudCtx.fillStyle = w.color;
      cloudCtx.textBaseline = 'middle';
      cloudCtx.textAlign = 'center';
      cloudCtx.translate(w.x + w.w / 2, w.y + w.h / 2);
      cloudCtx.rotate(w.rotate * Math.PI / 180);
      cloudCtx.globalAlpha = t;
      cloudCtx.fillText(w.text, 0, 0);
      cloudCtx.restore();
    }
    cloudCtx.restore();
    if (binMaskCanvas) applyMaskComposite(cloudCtx, binMaskCanvas);
  }

  function exportPNG() {
    // High-res export at ~300 DPI equivalent (scale from 96 to 300)
    const W = els.cloudCanvas.width;
    const H = els.cloudCanvas.height;
    const scale = Math.ceil(300 / 96); // ≈3~4x
    const out = document.createElement('canvas');
    out.width = W * scale; out.height = H * scale;
    const octx = out.getContext('2d');
    fontViolationCount = 0; // reset monitor for export
    // Rebuild mask at export size directly from source image for crisp edges
    const eMask = new Uint8Array(out.width * out.height);
    const eBin = document.createElement('canvas'); eBin.width = out.width; eBin.height = out.height;
    const ebctx = eBin.getContext('2d');
    if (sourceImage) {
      const scaleImg = Math.min(out.width / sourceImage.width, out.height / sourceImage.height);
      const drawW = Math.max(1, Math.floor(sourceImage.width * scaleImg));
      const drawH = Math.max(1, Math.floor(sourceImage.height * scaleImg));
      const dx = Math.floor((out.width - drawW) / 2);
      const dy = Math.floor((out.height - drawH) / 2);
      ebctx.clearRect(0, 0, out.width, out.height);
      ebctx.drawImage(sourceImage, dx, dy, drawW, drawH);
      const { data } = ebctx.getImageData(0, 0, out.width, out.height);
      const thr = Number(els.alphaThreshold.value) || 128;
      for (let i = 0; i < out.width * out.height; i++) {
        const a = data[i * 4 + 3];
        eMask[i] = a >= thr ? 1 : 0;
      }
    } else {
      for (let i = 0; i < out.width * out.height; i++) eMask[i] = 1;
    }
    // binary mask canvas
    const eImg = ebctx.createImageData(eBin.width, eBin.height);
    for (let i = 0; i < eBin.width * eBin.height; i++) {
      const p = i * 4; const on = eMask[i];
      eImg.data[p] = 255; eImg.data[p + 1] = 255; eImg.data[p + 2] = 255; eImg.data[p + 3] = on ? 255 : 0;
    }
    ebctx.putImageData(eImg, 0, 0);

    // Dense fill with tiered size buckets (export)
    const r = getFontRange(true);
    const rotCfg = getRotateConfig();
    const cfg = {
      minFont: r.min * scale,
      maxFont: r.max * scale,
      fontFamily: els.fontFamily.value || 'sans-serif',
      rotateMode: rotCfg.mode,
      rotateAngle: rotCfg.angle,
      colorScheme: (els.colorScheme?.value) || 'professional',
      tileStep: Math.max(6, Number(els.tileStep?.value) || 18) * scale,
    };
    const words = parseWords(els.wordsInput.value);
    const buckets = buildSizeBuckets(cfg.maxFont, cfg.minFont);
    const occ = new Uint8Array(out.width * out.height);
    // 顶层（最大字号）使用网格铺排，支持多次放置并自适应频率
    const maxBucketSize = buckets[0]?.size || cfg.maxFont;
    const stepTop = estimateTopStep(maxBucketSize);
    const capTop = estimateBucketCapacity(eMask, out.width, out.height, stepTop);
    const topVariants = createVariantsByBucketAdaptive(words, maxBucketSize, cfg.fontFamily, cfg.rotateMode, cfg.rotateAngle, cfg.minFont, cfg.maxFont, capTop);
    denseFillPass(octx, out.width, out.height, eMask, topVariants, stepTop, cfg.colorScheme, occ, cfg.minFont, 0.85, 0.9);
    if (els.showMaskUnderlay && els.showMaskUnderlay.checked) {
      const t = Math.max(0, Math.min(1, (Number(els.maskOpacity?.value) || 0) / 100));
      // black outline only, alpha = 1 - t
      const outline = document.createElement('canvas'); outline.width = out.width; outline.height = out.height;
      const o2 = outline.getContext('2d');
      const oImg = o2.createImageData(out.width, out.height);
      for (let y = 0; y < out.height; y++) {
        for (let x = 0; x < out.width; x++) {
          const i = y * out.width + x;
          if (!eMask[i]) continue;
          const up = y > 0 ? eMask[i - out.width] : 0;
          const down = y < out.height - 1 ? eMask[i + out.width] : 0;
          const left = x > 0 ? eMask[i - 1] : 0;
          const right = x < out.width - 1 ? eMask[i + 1] : 0;
          if (!(up && down && left && right)) {
            const p = i * 4; oImg.data[p] = 255; oImg.data[p + 1] = 255; oImg.data[p + 2] = 255; oImg.data[p + 3] = 255;
          }
        }
      }
      o2.putImageData(oImg, 0, 0);
      octx.save();
      octx.globalAlpha = 1 - t;
      octx.drawImage(outline, 0, 0);
      octx.globalCompositeOperation = 'source-atop';
      octx.fillStyle = '#000000';
      octx.fillRect(0, 0, out.width, out.height);
      octx.restore();
    }
    // layer fill from large to small sizes
    for (let bi = 0; bi < buckets.length; bi++) {
      const b = buckets[bi];
      const step = estimateTopStep(b.size);
      const capTiles = estimateBucketCapacity(eMask, out.width, out.height, step);
      const groupVariants = createVariantsByBucketAdaptive(
        words, b.size, cfg.fontFamily, cfg.rotateMode, cfg.rotateAngle,
        cfg.minFont, cfg.maxFont, capTiles
      );
      denseFillPass(octx, out.width, out.height, eMask, groupVariants, step, cfg.colorScheme, occ, cfg.minFont, 1.0, 1.0);
    }
    applyMaskComposite(octx, eBin);

    // Encode PNG with 300 DPI pHYs chunk
    const dataURL = out.toDataURL('image/png');
    const blob = dataURLToBlobWithDPI(dataURL, 300);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'wordcloud-300dpi.png';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  function exportSVG() {
    const W = els.cloudCanvas.width;
    const H = els.cloudCanvas.height;
    const words = placedWords && placedWords.length ? placedWords : null;
    if (!words) {
      alert('请先生成词云再导出 SVG');
      return;
    }
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
    for (const w of words) {
      const cx = w.x + w.w / 2;
      const cy = w.y + w.h / 2;
      svg += `<text x="0" y="0" fill="${w.color}" font-family="${w.fontFamily}" font-size="${w.fontSize}" text-anchor="middle" dominant-baseline="middle" transform="translate(${cx},${cy}) rotate(${w.rotate})">${escapeXml(w.text)}</text>`;
    }
    svg += `</svg>`;
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'wordcloud.svg';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }
  function escapeXml(s) {
    return String(s).replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]));
  }

  function clearAll() {
    placedWords = [];
    cloudCtx.clearRect(0, 0, els.cloudCanvas.width, els.cloudCanvas.height);
    // preview背景仍为深色，由外层样式控制；画布本身保持透明便于导出
  }

  function setControlsDisabled(disabled) {
    const nodes = document.querySelectorAll('input, select, textarea, button');
    nodes.forEach(n => { try { n.disabled = !!disabled; } catch (_) {} });
    if (!disabled) {
      try { syncRotateAngleInputState(); } catch (_) {}
    }
  }
  function setBusy(b) {
    if (els.main) {
      if (b) els.main.setAttribute('aria-busy', 'true');
      else els.main.removeAttribute('aria-busy');
    }
    setControlsDisabled(b);
  }

  // Events
  els.alphaThreshold.addEventListener('input', () => {
    if (els.alphaVal) {
      const v = String(els.alphaThreshold.value);
      if (els.alphaVal.tagName === 'INPUT') els.alphaVal.value = v; else els.alphaVal.textContent = v;
    }
    if (sourceImage) {
      try {
        if (baseLocked) { maskCanvas.width = baseW; maskCanvas.height = baseH; }
        else { maskCanvas.width = els.cloudCanvas.width; maskCanvas.height = els.cloudCanvas.height; }
      } catch (_) {}
      maskData = computeMaskFromImage(sourceImage, Number(els.alphaThreshold.value));
      renderMaskPreviewFromImage(sourceImage, Number(els.alphaThreshold.value));
    }
    if (alphaRegenDebounce) clearTimeout(alphaRegenDebounce);
    alphaRegenDebounce = setTimeout(() => {
      const hasWords = (els.wordsInput?.value || '').trim().length > 0;
      if (hasWords) els.generateBtn?.click();
    }, 200);
  });

  if (els.alphaVal && els.alphaVal.tagName === 'INPUT') {
    els.alphaVal.addEventListener('input', () => {
      const v = Math.max(0, Math.min(255, Number(els.alphaVal.value) || 0));
      els.alphaVal.value = String(v);
      els.alphaThreshold.value = String(v);
      if (sourceImage) {
        maskData = computeMaskFromImage(sourceImage, v);
        renderMaskPreviewFromImage(sourceImage, v);
      }
      if (alphaRegenDebounce) clearTimeout(alphaRegenDebounce);
      alphaRegenDebounce = setTimeout(() => {
        const hasWords = (els.wordsInput?.value || '').trim().length > 0;
        if (hasWords) els.generateBtn?.click();
      }, 200);
    });
    els.alphaVal.addEventListener('change', () => {
      const v = Math.max(0, Math.min(255, Number(els.alphaVal.value) || 0));
      els.alphaVal.value = String(v);
      els.alphaThreshold.value = String(v);
      if (sourceImage) {
        maskData = computeMaskFromImage(sourceImage, v);
        renderMaskPreviewFromImage(sourceImage, v);
      }
      const hasWords = (els.wordsInput?.value || '').trim().length > 0;
      if (hasWords) els.generateBtn?.click();
    });
  }

  if (els.maskOpacity) {
    const updateMaskOpacityText = () => {
      if (!els.maskOpacityVal) return;
      const v = Math.max(0, Math.min(100, Number(els.maskOpacity.value) || 0));
      if (els.maskOpacityVal.tagName === 'INPUT') els.maskOpacityVal.value = String(v);
      else els.maskOpacityVal.textContent = String(v);
    };
    const rerenderIfPossible = () => { if (placedWords && placedWords.length) fastRenderToFit(); };
    els.maskOpacity.addEventListener('input', () => { updateMaskOpacityText(); rerenderIfPossible(); });
    els.maskOpacity.addEventListener('change', () => { updateMaskOpacityText(); rerenderIfPossible(); });
  }

  if (els.maskOpacityVal && els.maskOpacityVal.tagName === 'INPUT') {
    const clamp100 = (n) => Math.max(0, Math.min(100, Number(n) || 0));
    const syncFromNum = () => {
      const v = clamp100(els.maskOpacityVal.value);
      els.maskOpacityVal.value = String(v);
      els.maskOpacity.value = String(v);
      if (placedWords && placedWords.length) fastRenderToFit();
    };
    els.maskOpacityVal.addEventListener('input', syncFromNum);
    els.maskOpacityVal.addEventListener('change', syncFromNum);
  }

  els.imageUpload.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      sourceImage = img;
      // 以当前画布尺寸 + 源图比例计算 viewport
      const cw = els.cloudCanvas.width, ch = els.cloudCanvas.height;
      viewport = computeViewport(cw, ch, img.width / img.height);
      console.info('[ratio] image', { canvas: { w: cw, h: ch }, src: { w: img.width, h: img.height, ratio: img.width / img.height }, viewport });
      try {
        const W = baseLocked ? baseW : els.cloudCanvas.width;
        const H = baseLocked ? baseH : els.cloudCanvas.height;
        maskCanvas.width = W; maskCanvas.height = H;
      } catch (_) {}
      maskData = computeMaskFromImage(img, Number(els.alphaThreshold.value));
      renderMaskPreviewFromImage(img, Number(els.alphaThreshold.value));
      maskOutlineCanvas = null;
      const hasWords = (els.wordsInput?.value || '').trim().length > 0;
      if (hasWords) els.generateBtn?.click();
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      console.error('图片加载失败');
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });

  els.clearImageBtn?.addEventListener('click', () => {
    try { els.imageUpload.value = ''; } catch (_) {}
    sourceImage = null; maskData = null; binMaskCanvas = null; maskOutlineCanvas = null;
    if (els.maskPreview) maskCtx.clearRect(0, 0, els.maskPreview.width, els.maskPreview.height);
    const hasWords = (els.wordsInput?.value || '').trim().length > 0;
    if (hasWords) els.generateBtn?.click(); else fastRenderToFit();
  });

  // Font range inputs validation：输入时仅提示，不校正；确认时弹窗
  if (els.minFont) {
    els.minFont.addEventListener('input', () => { sanitizeFontRange(els.minFont.value, els.maxFont?.value, false); });
    els.minFont.addEventListener('change', () => { getFontRange(true); });
  }
  if (els.maxFont) {
    els.maxFont.addEventListener('input', () => { sanitizeFontRange(els.minFont?.value, els.maxFont.value, false); });
    els.maxFont.addEventListener('change', () => { getFontRange(true); });
  }

  // 旋转相关交互：实时预览与自定义角度输入状态
  if (els.rotate) {
    els.rotate.addEventListener('change', () => {
      syncRotateAngleInputState();
      const hasWords = (els.wordsInput?.value || '').trim().length > 0;
      if (hasWords) els.generateBtn.click();
    });
  }
  // 自定义角度：仅在回车或失焦时提交，输入过程中不触发生成
  function commitRotateAngle() {
    if (!els.rotate || !els.rotateAngle) return;
    if (els.rotate.value !== 'custom') return;
    const v = els.rotateAngle.value;
    if (v === '' || v === null) return; // 未输入完整
    const ang = clampAngle(v);
    els.rotateAngle.value = String(ang);
    const hasWords = (els.wordsInput?.value || '').trim().length > 0;
    if (hasWords) els.generateBtn.click();
  }
  if (els.rotateAngle) {
    els.rotateAngle.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitRotateAngle();
      }
    });
    els.rotateAngle.addEventListener('blur', () => { commitRotateAngle(); });
  }

  // 调试叠加层开关
  if (els.debugOverlay) {
    els.debugOverlay.addEventListener('change', () => {
      clearDebug();
      if (placedWords.length) renderCloud(placedWords);
    });
  }

  // Load reference image for similarity check
  els.refUpload?.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const W = els.cloudCanvas.width; const H = els.cloudCanvas.height;
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const cctx = c.getContext('2d');
      // Fit & center
      const scale = Math.min(W / img.width, H / img.height);
      const dw = Math.max(1, Math.floor(img.width * scale));
      const dh = Math.max(1, Math.floor(img.height * scale));
      const dx = Math.floor((W - dw) / 2); const dy = Math.floor((H - dh) / 2);
      cctx.clearRect(0, 0, W, H);
      cctx.drawImage(img, dx, dy, dw, dh);
      const { data } = cctx.getImageData(0, 0, W, H);
      const arr = new Uint8Array(W * H);
      for (let i = 0; i < W * H; i++) {
        const p = i * 4;
        const r = data[p], g = data[p + 1], b = data[p + 2], a = data[p + 3];
        const lumin = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        arr[i] = (a > 200 ? 1 : 0) || (lumin < 200 ? 1 : 0); // alpha-first fallback to brightness
      }
      refImageData = arr;
      URL.revokeObjectURL(url);
    };
    img.onerror = () => { console.error('参考图加载失败'); URL.revokeObjectURL(url); };
    img.src = url;
  });

  els.generateBtn.addEventListener('click', () => {
    setBusy(true);
    requestAnimationFrame(() => {
      try {
        syncWordsFromTable();
        refreshWordColorsFromTable();
        refreshWordBoundsFromTable();
        refreshWordAnglesFromTable();
        const words = parseWords(els.wordsInput.value);
        if (!words.length) {
          alert('请在词语列表中至少输入一行词语');
          return;
        }
        const range = getFontRange(true);
        const rotCfg = getRotateConfig();
        const mode = els.fillMode?.value || 'dense';
        const cfg = {
          minFont: range.min,
          maxFont: range.max,
          fontFamily: els.fontFamily.value || 'sans-serif',
          rotateMode: rotCfg.mode,
          rotateAngle: rotCfg.angle,
          colorScheme: (els.colorScheme?.value) || 'professional',
          repeatFactor: Math.max(1, Number(els.repeatFactor?.value) || 3),
          tileStep: Math.max(6, Number(els.tileStep?.value) || 18),
        };
        if (mode === 'dense') {
          generateDenseFill(cfg);
        } else if (mode === 'spiral') {
          placedWords = layoutWordsSpiral(words, cfg);
          renderCloud(placedWords);
        } else {
          placedWords = layoutWords(words, cfg);
          renderCloud(placedWords);
        }
        updateMetrics();
      } catch (e) {
        console.error('生成失败', e);
        alert('生成失败：' + (e?.message || e));
      } finally {
        setBusy(false);
      }
    });
  });

  els.clearBtn.addEventListener('click', clearAll);
  els.exportBtn.addEventListener('click', () => { setBusy(true); requestAnimationFrame(() => { try { exportPNG(); } finally { setBusy(false); } }); });
  els.exportSvgBtn?.addEventListener('click', () => { setBusy(true); requestAnimationFrame(() => { try { exportSVG(); } finally { setBusy(false); } }); });

  els.validateBtn?.addEventListener('click', () => {
    updateMetrics(true);
  });

  // Tooltip on hover
  els.cloudCanvas.addEventListener('mousemove', (e) => {
    if (!placedWords.length) { els.tooltip.hidden = true; return; }
    const rect = els.cloudCanvas.getBoundingClientRect();
    const pxCSS = e.clientX - rect.left;
    const pyCSS = e.clientY - rect.top;
    const { s, ox, oy } = getContainTransform(rect.width, rect.height);
    const bx = (pxCSS - ox) / Math.max(s, 1e-6);
    const by = (pyCSS - oy) / Math.max(s, 1e-6);
    if (bx < 0 || by < 0 || bx > baseW || by > baseH) { els.tooltip.hidden = true; return; }
    let found = null;
    for (const w of placedWords) {
      if (bx < w.x || bx > w.x + w.w || by < w.y || by > w.y + w.h) continue;
      const g = getGlyphCached(w.text, w.fontFamily, w.fontSize, w.rotate);
      const lx = bx - (w.x + g.offX);
      const ly = by - (w.y + g.offY);
      if (lx >= 0 && lx < g.bw && ly >= 0 && ly < g.bh) {
        if (g.mask[ly * g.bw + lx]) { found = w; break; }
      }
    }
    if (found) {
      els.tooltip.hidden = false;
      els.tooltip.textContent = `${found.text} (${found.weight})`;
      els.tooltip.style.left = `${pxCSS}px`;
      els.tooltip.style.top = `${pyCSS}px`;
    } else {
      els.tooltip.hidden = true;
    }
  });

  els.cloudCanvas.addEventListener('mouseleave', () => { els.tooltip.hidden = true; });

  // Initialize canvas background
  clearAll();

  // Metrics
  function updateMetrics(force = false) {
    const W = els.cloudCanvas.width, H = els.cloudCanvas.height;
    const img = cloudCtx.getImageData(0, 0, W, H);
    let filledInside = 0, totalInside = 0, overflow = 0;
    for (let i = 0; i < W * H; i++) {
      const a = img.data[i * 4 + 3];
      if (maskData) {
        if (maskData[i]) { totalInside++; if (a > 0) filledInside++; }
        else { if (a > 0) overflow++; }
      } else {
        totalInside++; if (a > 0) filledInside++;
      }
    }
    const coverage = totalInside ? filledInside / totalInside : 0;
    const leakRatio = (overflow / (W * H)) || 0;
    if (els.coverage) els.coverage.textContent = `${(coverage * 100).toFixed(2)}%`;
    if (els.leak) els.leak.textContent = `${(leakRatio * 100).toFixed(3)}%`;

    // Similarity via IoU against reference image if present
    let simText = '-';
    if (refImageData) {
      let inter = 0, union = 0;
      for (let i = 0; i < W * H; i++) {
        const ours = img.data[i * 4 + 3] > 0 ? 1 : 0;
        const ref = refImageData[i] ? 1 : 0;
        if (ours || ref) union++;
        if (ours && ref) inter++;
      }
      const iou = union ? inter / union : 0;
      simText = `${(iou * 100).toFixed(2)}%`;
    }
    if (els.similarity) els.similarity.textContent = simText;
    if (els.fontViolations) els.fontViolations.textContent = String(fontViolationCount);
    if (force) {
      alert(`覆盖率: ${(coverage * 100).toFixed(2)}%\n溢出: ${(leakRatio * 100).toFixed(3)}%\n相似度: ${simText}`);
    }
  }

  // --- Browser tests: glyph bbox tightness across angles/fonts ---
  function runGlyphTests() {
    const fonts = ['sans-serif', 'serif'];
    const angles = [-90, -60, -45, -30, 0, 30, 45, 60, 90];
    const sizes = [24, 48, 96];
    const word = '的分胜2';
    let pass = 0, fail = 0;
    console.group('Glyph Tight Bounding Box Tests');
    for (const font of fonts) {
      for (const ang of angles) {
        for (const sz of sizes) {
          const g = rasterizeGlyph(word, font, sz, ang);
          const rbArea = g.rbw * g.rbh;
          const maskArea = g.bw * g.bh;
          const tightness = rbArea ? (maskArea / rbArea) : 0;
          const ok = rbArea > 0 && maskArea > 0 && tightness <= 1;
          if (ok) pass++; else fail++;
          console.log(`font=${font} size=${sz} angle=${ang} rb=${g.rbw}x${g.rbh} bbox=${g.bw}x${g.bh} tightness=${(tightness * 100).toFixed(2)}% ${ok ? '✅' : '❌'}`);
        }
      }
    }
    console.log(`Summary: pass=${pass} fail=${fail}`);
    console.groupEnd();
  }

  // Query param to run tests: ?test=1
  try {
    const qs = new URLSearchParams(location.search);
    if (qs.get('test') === '1') runGlyphTests();
    if (qs.get('testFont') === '1') runMinFontTests();
    if (qs.get('testColor') === '1') runColorTests();
  } catch (_) { /* ignore */ }

  // --- Min font enforcement tests ---
  function runMinFontTests() {
    console.group('Min Font Enforcement Tests');
    const originalW = els.cloudCanvas.width;
    const originalH = els.cloudCanvas.height;
    const rotCfg = getRotateConfig();
    const range = getFontRange(true);
    const cfgBase = {
      minFont: range.min,
      maxFont: range.max,
      fontFamily: els.fontFamily.value || 'sans-serif',
      rotateMode: rotCfg.mode,
      rotateAngle: rotCfg.angle,
      colorScheme: (els.colorScheme?.value) || 'professional',
      repeatFactor: 3,
      tileStep: Math.max(6, Number(els.tileStep.value) || 18),
    };

    const scenarios = [
      { name: '小容器(240x160)', w: 240, h: 160 },
      { name: '大容器(1024x768)', w: 1024, h: 768 },
      { name: '正方形(800x800)', w: 800, h: 800 },
    ];

    const multiLangWords = [
      { text: '外发都', weight: 10 },
      { text: 'WordCloud', weight: 8 },
      { text: 'テスト', weight: 7 },
      { text: 'اختبار', weight: 6 },
      { text: '12345', weight: 5 },
    ];

    for (const sc of scenarios) {
      els.cloudCanvas.width = sc.w; els.cloudCanvas.height = sc.h;
      maskCanvas.width = sc.w; maskCanvas.height = sc.h;
      fontViolationCount = 0;
      // 生成紧密填充
      generateDenseFill(cfgBase);
      console.log(`${sc.name}: fontViolations=${fontViolationCount}`);
      // 常规布局
      const placed = layoutWords(multiLangWords.map(w => ({ ...w, norm: 1 })), cfgBase);
      const minSz = placed.length ? Math.min(...placed.map(p => p.fontSize)) : cfgBase.minFont;
      console.log(`${sc.name} layout minSize=${minSz} (>=${cfgBase.minFont})`);
    }

    // 动态内容加载：追加词语
    els.cloudCanvas.width = originalW; els.cloudCanvas.height = originalH;
    maskCanvas.width = originalW; maskCanvas.height = originalH;
    fontViolationCount = 0;
    const dynamicWords = [...multiLangWords, { text: '动态加载', weight: 9 }, { text: 'new', weight: 4 }];
    const buckets = buildSizeBuckets(cfgBase.maxFont, cfgBase.minFont);
    const firstSize = buckets[0]?.size || cfgBase.maxFont;
    const stepTest = Math.max(6, Math.floor(firstSize * (firstSize >= 96 ? 1.1 : 0.9)));
    const capTest = estimateBucketCapacity(maskData, els.cloudCanvas.width, els.cloudCanvas.height, stepTest);
    const variants = createVariantsByBucketAdaptive(dynamicWords.map(w => ({ ...w, norm: 1 })), firstSize, cfgBase.fontFamily, cfgBase.rotateMode, cfgBase.rotateAngle, cfgBase.minFont, cfgBase.maxFont, capTest);
    // 验证最小字号生成
    const genMin = Math.min(...variants.map(v => v.fontSize));
    console.log(`动态内容: 生成变体最小字号=${genMin} (>=${cfgBase.minFont})`);
    console.groupEnd();
  }

  // --- Color conversion & WCAG tests ---
  function runColorTests() {
    console.group('Color Conversion & WCAG Tests');
    const cases = [
      '#22d3ee', '#0ea5e9', '#f59e0b', '#111111', '#eeeeee', 'rgb(34, 211, 238)', 'hsl(200, 85%, 60%)'
    ];
    const bg = DEFAULT_BG;
    let pass = 0, fail = 0;
    for (const s of cases) {
      const c = parseColor(s);
      const hex = c ? rgbToHex(c) : null;
      const hsl = c ? rgbToHsl(c) : null;
      const roundTrip = hsl ? hslToRgb(hsl.h, hsl.s, hsl.l) : null;
      const okRT = roundTrip ? (Math.abs(roundTrip.r - c.r) <= 3 && Math.abs(roundTrip.g - c.g) <= 3 && Math.abs(roundTrip.b - c.b) <= 3) : false;
      const ensured = ensureContrast(hex || s, bg, 4.5);
      const ratio = contrastRatio(parseColor(ensured), parseColor(bg));
      const okAA = ratio >= 4.5;
      pass += (okRT ? 1 : 0) + (okAA ? 1 : 0);
      fail += (okRT ? 0 : 1) + (okAA ? 0 : 1);
      console.log(`${s} → hex=${hex} AA=${okAA ? '✅' : '❌'} ratio=${ratio.toFixed(2)} RT=${okRT ? '✅' : '❌'}`);
    }
    console.log(`Summary: pass=${pass} fail=${fail}`);
    console.groupEnd();
  }

  // DataURL to Blob and inject pHYs chunk for DPI metadata
  function dataURLToBlobWithDPI(dataURL, dpi) {
    const bin = atob(dataURL.split(',')[1]);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    try {
      const injected = injectPngDPI(buf, dpi);
      return new Blob([injected], { type: 'image/png' });
    } catch (e) {
      console.warn('DPI 注入失败，返回原图', e);
      return new Blob([buf], { type: 'image/png' });
    }
  }

  function injectPngDPI(bytes, dpi) {
    // PNG signature
    const sig = [137, 80, 78, 71, 13, 10, 26, 10];
    for (let i = 0; i < sig.length; i++) if (bytes[i] !== sig[i]) throw new Error('不是PNG');
    // Find IHDR end
    let pos = 8; // after signature
    function readUInt32BE(p) { return (bytes[p] << 24) | (bytes[p + 1] << 16) | (bytes[p + 2] << 8) | bytes[p + 3]; }
    const ihdrLen = readUInt32BE(pos); pos += 4; // length
    pos += 4; // type IHDR
    pos += ihdrLen; // data
    pos += 4; // CRC
    const ppm = Math.round(dpi / 0.0254); // pixels per meter
    const chunkData = new Uint8Array(9);
    // X pixels per unit
    chunkData[0] = (ppm >>> 24) & 0xff; chunkData[1] = (ppm >>> 16) & 0xff; chunkData[2] = (ppm >>> 8) & 0xff; chunkData[3] = ppm & 0xff;
    // Y
    chunkData[4] = chunkData[0]; chunkData[5] = chunkData[1]; chunkData[6] = chunkData[2]; chunkData[7] = chunkData[3];
    // unit specifier: meter
    chunkData[8] = 1;
    const type = new Uint8Array([112, 72, 89, 115]); // 'pHYs'
    const len = new Uint8Array([0, 0, 0, 9]);
    const crc = crc32(concat(type, chunkData));
    const crcBytes = new Uint8Array([ (crc >>> 24) & 0xff, (crc >>> 16) & 0xff, (crc >>> 8) & 0xff, crc & 0xff ]);
    const head = bytes.slice(0, pos);
    const tail = bytes.slice(pos);
    const out = concat(head, len, type, chunkData, crcBytes, tail);
    return out;
  }

  function concat(...arrs) {
    let total = 0; arrs.forEach(a => total += a.length);
    const out = new Uint8Array(total); let p = 0;
    for (const a of arrs) { out.set(a, p); p += a.length; }
    return out;
  }

  // CRC32 for PNG chunks
  function crc32(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
      crc ^= bytes[i];
      for (let j = 0; j < 8; j++) {
        const mask = (crc & 1) ? 0xedb88320 : 0;
        crc = (crc >>> 1) ^ mask;
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  }
})();