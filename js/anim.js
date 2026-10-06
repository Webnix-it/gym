/* ===== anim.js — Motore animazioni SVG scheletriche per la libreria esercizi =====
 * Ogni esercizio è definito come una sequenza di POSE (angolazioni delle articolazioni).
 * Il motore interpola linearmente le pose e genera keyframes CSS SMIL <animate> che
 * muovono un omino vettoriale (capo + corpo + 4 arti) con attrezzi (bilanciere/manubri).
 * Nessuna dipendenza esterna: funziona 100% offline. Approccio ispirato a librerie
 * open-source di illustrazioni fitness (es. "fitness-anatomy", set icone CC-BY/MIT),
 * qui reimplementato in vanilla JS/SVG.
 */
(function (global) {
  "use strict";

  const rad = d => d * Math.PI / 180;
  // punto raggiunto da un segmento di lunghezza len che parte da (x,y) con angolo deg
  // convenzione: 0° = verso il basso (+y), 90° = destra (+x), -90° = sinistra, 180° = sopra
  function segPt(x, y, len, deg){ return [x + len * Math.sin(rad(deg)), y + len * Math.cos(rad(deg))]; }

  /* Geometria base (viewBox 0 0 100 130):
     testa r=7 a collo (50,26); torso (50,26)->(50,68); spalle L(43,33)/R(57,33);
     braccio sup 14, avambraccio 13; fianchi L(45,68)/R(55,68); coscia 24, gamba 23.
     Pose campi: lean (inclinazione busto su fianchi), neckL/neckR (spalla->gomito),
     elbL/elbR (gomito->mano, relativo), hipL/hipR (fianco->ginocchio),
     kneeL/kneeR (ginocchio->caviglia, relativo), crouch (abbassamento globale),
     sit (true: cosce orizzontali avanti), props: [{at:'hands'|'handL'|'handR'|'back'}]
  */
  function joints(p){
    const lean = p.lean || 0, cr = p.crouch || 0;
    function rot(pt, piv, deg){
      const r = rad(deg), c = Math.cos(r), s = Math.sin(r);
      const dx = pt[0]-piv[0], dy = pt[1]-piv[1];
      return [piv[0]+dx*c-dy*s, piv[1]+dx*s+dy*c];
    }
    const hipMid = [50, 68 + cr];
    const neck   = rot([50, 26], hipMid, lean);
    const headC  = rot([50, 18], hipMid, lean);
    const shL    = rot([43, 33], hipMid, lean);
    const shR    = rot([57, 33], hipMid, lean);
    const hipL   = [45, hipMid[1]], hipR = [55, hipMid[1]];
    const elbL = segPt(shL[0], shL[1], 14, p.neckL ?? 8);
    const hndL = segPt(elbL[0], elbL[1], 13, (p.neckL ?? 8) + (p.elbL ?? 0));
    const elbR = segPt(shR[0], shR[1], 14, p.neckR ?? -8);
    const hndR = segPt(elbR[0], elbR[1], 13, (p.neckR ?? -8) + (p.elbR ?? 0));
    let knL, knR, ftL, ftR;
    if(p.sit){
      knL = [hipL[0]-3, hipL[1]+3]; knR = [hipR[0]+3, hipR[1]+3];
      ftL = segPt(knL[0], knL[1], 23, p.kneeL ?? 95);
      ftR = segPt(knR[0], knR[1], 23, p.kneeR ?? 95);
    } else {
      knL = segPt(hipL[0], hipL[1], 24, p.hipL ?? 4);
      ftL = segPt(knL[0], knL[1], 23, (p.hipL ?? 4) + (p.kneeL ?? -4));
      knR = segPt(hipR[0], hipR[1], 24, p.hipR ?? -4);
      ftR = segPt(knR[0], knR[1], 23, (p.hipR ?? -4) + (p.kneeR ?? 4));
    }
    return { headC, neck, shL, shR, hipL, hipR, elbL, hndL, elbR, hndR, knL, ftL, knR, ftR, hipMid };
  }

  function n(v){ return Math.round(v*10)/10; }
  const P2 = pt => `${n(pt[0])} ${n(pt[1])}`;

  // path del corpo (senza capo): torso, linea spalle, 4 arti
  function bodyPath(p){
    const q = joints(p);
    let d = `M${P2(q.neck)}L${P2(q.hipMid)}`;                                   // torso
    d += `M${P2(q.shL)}L${P2(q.shR)}`;                                           // spalle
    d += `M${P2(q.shL)}L${P2(q.elbL)}L${P2(q.hndL)}`;
    d += `M${P2(q.shR)}L${P2(q.elbR)}L${P2(q.hndR)}`;
    d += `M${P2(q.hipL)}L${P2(q.knL)}L${P2(q.ftL)}`;
    d += `M${P2(q.hipR)}L${P2(q.knR)}L${P2(q.ftR)}`;
    return d;
  }
  // cerchio testa come path (bezier)
  function headPath(p){
    const q = joints(p), cx=n(q.headC[0]), cy=n(q.headC[1]), r=7, k=r*0.5523;
    return `M${n(cx-r)} ${cy}c0,-${n(k)} ${n(-k)},${-r} ${r},${-r}c${n(k)},0 ${r},${n(k)} ${r},${r}c0,${n(k)} ${n(k)},${r} ${-r},${r}c${n(-k)},0 ${-r},${n(-k)} ${-r},${-r}z`;
  }
  // attrezzo: bilanciere tra le mani
  function barPath(p){
    const q = joints(p);
    return `M${P2(q.hndL)}L${P2(q.hndR)}`;
  }

  /* ---------- interpolazione pose ---------- */
  function lerpPose(a, b, t){
    const o = {};
    const keys = new Set(Object.keys(a).concat(Object.keys(b)));
    keys.forEach(k => {
      if(k === "props" || k === "sit"){ o[k] = (t < .5 ? a[k] : b[k]); return; }
      const va = a[k] ?? 0, vb = b[k] ?? 0;
      o[k] = va + (vb - va) * t;
    });
    return o;
  }

  // genera lista frame andata+ritorno (ping-pong fluido)
  function cycleFrames(poses, steps){
    steps = steps || 8;
    const seq = [];
    for(let i = 0; i < poses.length - 1; i++)
      for(let s = 0; s < steps; s++) seq.push(lerpPose(poses[i], poses[i+1], s/steps));
    seq.push(poses[poses.length-1]);
    for(let i = seq.length - 2; i >= 1; i--) seq.push(seq[i]);
    return seq;
  }

  function valuesAttr(frames, fn){ return frames.map(fn).join(";") + ";" + fn(frames[0]); }

  /* ---------- attrezzi statici (panca / rack lat machine) ---------- */
  function benchSvg(y){
    y = y || 92;
    return `<g class="exbench">
      <rect x="24" y="${y}" width="52" height="6" rx="3"/>
      <line x1="30" y1="${y+6}" x2="27" y2="116"/><line x1="70" y1="${y+6}" x2="73" y2="116"/>
      <rect x="20" y="${y-22}" width="7" height="24" rx="3"/>
    </g>`;
  }
  function latMachineSvg(){
    return `<g class="exlat">
      <line x1="84" y1="6" x2="84" y2="116"/><line x1="70" y1="8" x2="96" y2="8"/>
      <rect x="76" y="10" width="16" height="5" rx="2"/>
    </g>`;
  }

  /* ---------- costruttore SVG animato ----------
   * def = { poses:[...], dur:1.6, props:['bar'|'dumbL'|'dumbR'|'none'], ground:true,
   *         bench:true, lat:true, floorY, hi:{left,right,top,bottom}, lo:{...} }
   * hi/lo definiscono una SECONDA pose (frame finale del movimento): l'omino
   * interpola continuamente tra le due, così il grafico evidenzia il ROM completo.
   * Ritorna stringa SVG con <animate> SMIL (funziona anche senza JS nel DOM finale).
   */
  function build(def){
    const frames = cycleFrames(def.poses, def.steps || 8);
    const dur = (def.dur || 1.6) + "s";
    const hasBar = (def.props||[]).includes("bar");
    const hasDumbL = (def.props||[]).includes("dumbL");
    const hasDumbR = (def.props||[]).includes("dumbR");

    /* --- seconda figura in dissolvenza (pose "high" vs "low") --- */
    let ghostSvg = "", hlSvg = "";
    if(def.hi && def.lo){
      const gFrames = [def.lo];
      for(let s=1;s<=10;s++) gFrames.push(lerpPose(def.lo, def.hi, s/10));
      for(let s=9;s>=1;s--) gFrames.push(lerpPose(def.lo, def.hi, s/10));
      const gd = (def.dur||1.6)*1.25 + "s";
      ghostSvg = `<g class="exghost">
        <path class="exbody" fill="none"><animate attributeName="d" values="${valuesAttr(gFrames, bodyPath)}" dur="${gd}" repeatCount="indefinite"/></path>
        <path class="exhead"><animate attributeName="d" values="${valuesAttr(gFrames, headPath)}" dur="${gd}" repeatCount="indefinite"/></path>
      </g>`;
      // frecce del range of motion tra i due punti indicati
      if(def.hi.left && def.lo.left){
        const a = def.hi.left, b = def.lo.left;
        const mx=(a[0]+b[0])/2, my=(a[1]+b[1])/2;
        const ang = Math.atan2(b[1]-a[1], b[0]-a[0])*180/Math.PI;
        const len = Math.hypot(b[0]-a[0], b[1]-a[1]);
        hlSvg = `<g class="exrom" transform="translate(${n(mx)} ${n(my)}) rotate(${n(ang)})">
          <line x1="${-len/2+5}" y1="0" x2="${len/2-5}" y2="0"/>
          <path d="M${-len/2} 0l6 -3.4v6.8zM${len/2} 0l-6 -3.4v6.8"/>
        </g>`;
      }
    }

    // dischi manubrio alla mano (segmento corto che segue la mano)
    function dumbbellSvg(side){
      const f = frames.map(fr => { const q = joints(fr); return side==="L"?q.hndL:q.hndR; });
      const dx = side==="L" ? -3 : 3;
      const pair = pt => `${P2(pt)} ${P2([pt[0]+dx, pt[1]+4])}`;
      const pts = f.map(pair).join(";") + ";" + pair(f[0]);
      return `<polyline class="exwdumb" points="${pair(f[0])}" fill="none">
        <animate attributeName="points" values="${pts}" dur="${dur}" repeatCount="indefinite"/></polyline>`;
    }

    let propSvg = "";
    if(hasBar){
      propSvg += `<path class="exbar" fill="none"><animate attributeName="d" values="${valuesAttr(frames, barPath)}" dur="${dur}" repeatCount="indefinite"/></path>`;
      ["hndL","hndR"].forEach(h => {
        propSvg += `<circle class="exw" r="4.5"><animate attributeName="cx" values="${frames.map(fr=>n(joints(fr)[h][0])).join(";")}" dur="${dur}" repeatCount="indefinite"/><animate attributeName="cy" values="${frames.map(fr=>n(joints(fr)[h][1])).join(";")}" dur="${dur}" repeatCount="indefinite"/></circle>`;
      });
    }
    if(hasDumbL) propSvg += `<circle class="exw" r="4"><animate attributeName="cx" values="${frames.map(fr=>n(joints(fr).hndL[0])).join(";")}" dur="${dur}" repeatCount="indefinite"/><animate attributeName="cy" values="${frames.map(fr=>n(joints(fr).hndL[1])).join(";")}" dur="${dur}" repeatCount="indefinite"/></circle>` + dumbbellSvg("L");
    if(hasDumbR) propSvg += `<circle class="exw" r="4"><animate attributeName="cx" values="${frames.map(fr=>n(joints(fr).hndR[0])).join(";")}" dur="${dur}" repeatCount="indefinite"/><animate attributeName="cy" values="${frames.map(fr=>n(joints(fr).hndR[1])).join(";")}" dur="${dur}" repeatCount="indefinite"/></circle>` + dumbbellSvg("R");

    // sfondo: pavimento, panca, lat machine
    const ground = def.ground !== false
      ? `<line class="exg" x1="14" y1="${def.floorY||116}" x2="86" y2="${def.floorY||116}"/>` : "";
    const equip = (def.bench ? benchSvg(def.benchY) : "") + (def.lat ? latMachineSvg() : "");

    return `<svg class="exanim" viewBox="0 0 100 130" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      ${equip}${ground}${ghostSvg}${hlSvg}
      <path class="exbody" fill="none"><animate attributeName="d" values="${valuesAttr(frames, bodyPath)}" dur="${dur}" repeatCount="indefinite"/></path>
      <path class="exhead"><animate attributeName="d" values="${valuesAttr(frames, headPath)}" dur="${dur}" repeatCount="indefinite"/></path>
      ${propSvg}
    </svg>`;
  }

  /* ---------- helper per definire pose "hi/lo" (double-bis) ---------- */
  function hiLo(loPose, hiPose, opts){
    return Object.assign({ poses:[loPose, hiPose], hi:hiPose, lo:loPose }, opts||{});
  }

  /* ---------- rendering on-demand (performance) ----------
   * Le demo SVG contengono animazioni SMIL: renderizzarle tutte insieme
   * (38 card libreria + thumbnail schede + live) pesa su CPU/GPU.
   * Strategia:
   *  - markup con data-def-id (nessun animate finché non serve);
   *  - IntersectionObserver attiva le animazioni solo quando la card è
   *    visibile e le sospende quando esce dallo viewport;
   *  - fallback: se IO non è disponibile, tutto attivo subito.
   */
  const _defs = new Map();     // id -> definizione pose
  const _html = new Map();     // id -> stringa SVG completa (cache)
  let _uid = 0;
  const _buildRaw = build;

  function buildCached(def){
    if(!def.__id) def.__id = ++_uid;
    _defs.set(def.__id, def);
    if(_html.has(def.__id)) return _html.get(def.__id);
    const raw = _buildRaw(def);
    // versione "idle": stesso corpo SVG ma senza figli <animate> (statica, zero costi)
    const idle = raw
      .replace(/<animate[^>]*\/>/g, "")
      .replace(/<svg class="exanim"/, `<svg class="exanim" data-def-id="${def.__id}"`);
    _html.set(def.__id, idle);
    return idle;
  }

  function activate(svg){
    const id = +svg.dataset.defId;
    const def = _defs.get(id);
    if(!def || svg.dataset.active === "1") return;
    const full = _buildRaw(def);
    svg.innerHTML = full.replace(/^<svg[^>]*>|<\/svg>$/g, "");
    svg.dataset.active = "1";
    try{ svg.setCurrentTime(0); svg.unpauseAnimations(); }catch(e){}
  }
  function deactivate(svg){
    if(svg.dataset.active !== "1") return;
    svg.innerHTML = "";           // rimuove gli <animate>: zero costo CPU/GPU
    svg.dataset.active = "0";
  }

  let _io = null;
  const _visible = new WeakSet();
  function ensureIO(){
    if(_io || typeof IntersectionObserver !== "function") return;
    _io = new IntersectionObserver(entries => {
      entries.forEach(en => {
        const svg = en.target;
        if(en.isIntersecting){
          activate(svg);
        } else {
          try{ svg.pauseAnimations(); }catch(e){}
          // se resta fuori schermo a lungo, scarica del tutto dal DOM
          setTimeout(() => {
            if(svg.isConnected && !_visibleNow(svg)) deactivate(svg);
          }, 5000);
        }
      });
    }, { rootMargin: "180px 0px", threshold: 0.02 });
  }
  function _visibleNow(svg){
    try{
      const r = svg.getBoundingClientRect();
      return r.bottom > -200 && r.top < (innerHeight||800) + 200;
    }catch(e){ return true; }
  }

  /* chiama hydrate() dopo ogni innerHTML: attiva le demo quando entrano nel viewport */
  function hydrate(root){
    if(!root || !root.querySelectorAll) return;
    const svgs = Array.from(root.querySelectorAll("svg.exanim[data-def-id]:not([data-active])"));
    if(!svgs.length) return;
    // modali / contenitori piccoli: attiva subito (poche SVG)
    const total = root.querySelectorAll("svg.exanim").length;
    if(typeof IntersectionObserver !== "function" || total <= 9){
      svgs.forEach(s => activate(s));
      return;
    }
    ensureIO();
    svgs.forEach(s => { _io.observe(s); _visible.add(s); });
    // prima finestra visibile parte subito (senza attendere il callback IO)
    requestAnimationFrame(() => svgs.slice(0, 12).forEach(s => { if(_visibleNow(s)) activate(s); }));
  }

  function pauseAll(){
    document.querySelectorAll("svg.exanim[data-active='1']").forEach(s => { try{ s.pauseAnimations(); }catch(e){} });
  }
  function playAll(){
    document.querySelectorAll("svg.exanim[data-active='1']").forEach(s => { try{ s.unpauseAnimations(); }catch(e){} });
  }
  function setPlaying(on){
    document.querySelectorAll("svg.exanim[data-active='1']").forEach(s => {
      try{ on ? s.unpauseAnimations() : s.pauseAnimations(); }catch(e){}
    });
  }

  global.SWT_ANIM = { build: buildCached, joints, bodyPath, headPath, hiLo,
                      pauseAll, playAll, setPlaying, hydrate };
})(window);
