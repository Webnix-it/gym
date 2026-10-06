/* ===== app.js — Logica UI: viste, router, modali, live workout, dashboard ===== */
(function (global) {
  "use strict";

  const D = global.SWT_DATA, S = global.SWT_STORE;
  const $  = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));

  /* ---------- utils ---------- */
  function esc(s){ return String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  /* escape per attributi HTML: niente apici non protetti negli onclick inline */
  function attrEsc(s){ return esc(String(s ?? "")).replace(/'/g,"\\'").replace(/"/g,"&quot;"); }
  function fmtDate(ts){ const d=new Date(ts); return d.toLocaleDateString("it-IT",{day:"2-digit",month:"short",year:"numeric"}); }
  function fmtTime(ts){ const d=new Date(ts); return d.toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"}); }
  function fmtDur(ms){
    const s=Math.max(0,Math.floor(ms/1000));
    const h=Math.floor(s/3600), m=Math.floor(s%3600/60), ss=s%60;
    return (h?String(h).padStart(2,"0")+":":"") + String(m).padStart(2,"0")+":"+String(ss).padStart(2,"0");
  }
  function muscleLabel(k){ return (D.MUSCLE_GROUPS[k]||{}).label || k; }
  function toast(msg){
    const t=$("#toast"); if(!t) return;
    t.textContent=msg; t.classList.add("show");
    clearTimeout(toast._t); toast._t=setTimeout(()=>t.classList.remove("show"),1800);
  }
  function iconBtn(icon,title,cls,onclickAttr){
    return `<button class="icon-btn ${cls||""}" title="${esc(title)}" ${onclickAttr||""}><svg><use href="#ic-${icon}"/></svg></button>`;
  }

  /* ---------- stato UI ---------- */
  const ui = {
    view: "routines",
    openRoutineId: null,
    libFilter: "all",
    libSearch: "",
    tick: null
  };

  /* ================= Router / tabs ================= */
  function switchView(v, force){
    const same = ui.view === v;
    ui.view = v;
    $$(".tab").forEach(b => b.classList.toggle("active", b.dataset.view===v));
    $$(".view").forEach(s => s.classList.toggle("active", s.id==="view-"+v));
    if(!same || force !== false) render();
  }

  /* ---------- delega eventi robusta (inline onclick + fallback JS) ---------- */
  function setupDelegation(){
    if(document.body && document.body._delegated) return;
    if(document.body) document.body._delegated = true;
    // Anti doppio-intervento: key dell'ultimo evento già gestito (inline vs delega)
    let lastEv = null;
    window.__swtHandled = ev => { if(!ev || ev === lastEv) return false; lastEv = ev; return true; };
    document.addEventListener("click", ev => {
      const el = ev.target.closest("[onclick]");
      if(!el) return;
      if(el.tagName === "INPUT" || el.tagName === "SELECT") return;
      const m = String(el.getAttribute("onclick")).match(/App\.(\w+)\(([^)]*)\)/);
      if(!m) return;
      const fn = App[m[1]];
      if(typeof fn !== "function") return;
      if(!window.__swtHandled(ev)) return; // l'handler inline lo ha già gestito
      const args = [];
      const re = /'([^']*)'|"([^"]*)"|(-?\d+(?:\.\d+)?)/g;
      let mm;
      while((mm = re.exec(m[2])) !== null){
        args.push(mm[1] !== undefined ? mm[1] : (mm[2] !== undefined ? mm[2] : Number(mm[3])));
      }
      try { fn.apply(App, [el].concat(args)); } catch(e){ console.error(e); }
    });

    /* ----- drag & drop per riordinare gli esercizi in una scheda ----- */
    document.addEventListener("dragstart", ev => {
      const it = ev.target.closest && ev.target.closest(".ex-item[data-idx]");
      if(!it) return;
      dragCtx = { rid: it.dataset.rid, from: +it.dataset.idx };
      it.classList.add("dragging");
      if(ev.dataTransfer){ ev.dataTransfer.effectAllowed = "move"; try{ ev.dataTransfer.setData("text/plain",""); }catch(e){} }
    });
    document.addEventListener("dragend", () => {
      $$(".ex-item").forEach(x => x.classList.remove("dragging"));
      dragCtx = null;
    });
    document.addEventListener("dragover", ev => {
      if(!dragCtx) return;
      const over = ev.target.closest && ev.target.closest(".ex-item[data-idx]");
      if(!over || !dragCtx) return;
      ev.preventDefault();
      if(ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
      const rect = over.getBoundingClientRect();
      const before = (ev.clientY - rect.top) < rect.height/2;
      const draggingEl = document.querySelector(".ex-item.dragging");
      if(draggingEl && draggingEl !== over){
        const list = over.parentNode;
        if(before) list.insertBefore(draggingEl, over);
        else list.insertBefore(draggingEl, over.nextSibling);
      }
    });
    document.addEventListener("drop", ev => {
      if(!dragCtx) return;
      ev.preventDefault();
      const to = +ev.target.closest?.(".ex-item[data-idx]")?.dataset.idx;
      const ctx = dragCtx; dragCtx = null;
      if(Number.isFinite(to)){
        const r = S.getRoutine(ctx.rid);
        if(r){
          // riposiziona l'array in base all'ordine DOM attuale post-move
          const domOrder = Array.from(document.querySelectorAll(`.ex-item[data-rid="${ctx.rid}"]`))
                                .map(el => el.querySelector("[data-uid]")?.getAttribute("data-uid")
                                     || el.id.replace("item-",""));
          const byUid = {}; r.exercises.forEach(e => byUid[e.uid] = e);
          const next = domOrder.map(u => byUid[u]).filter(Boolean);
          // eventuali esercizi non presenti nel DOM restano in coda
          r.exercises.forEach(e => { if(!next.includes(e)) next.push(e); });
          if(next.length === r.exercises.length){ r.exercises = next; S.save(); }
        }
      }
      render();
    });
  }
  let dragCtx = null;

  /* ---------- KPI con conteggio animato (micro-interazione) ---------- */
  function animateCounters(root){
    if(!root || global.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    root.querySelectorAll(".kpi-val[data-count]").forEach(el => {
      const target = parseFloat(el.dataset.count) || 0;
      const dur = 850, t0 = performance.now();
      const fmt = v => el.dataset.fmt === "n" ? Math.round(v).toLocaleString("it-IT") : String(Math.round(v));
      el.textContent = fmt(0);
      (function step(t){
        const p = Math.min(1, (t - t0)/dur), e = 1 - Math.pow(1-p, 3);
        el.textContent = fmt(target * e);
        if(p < 1) requestAnimationFrame(step); else el.textContent = fmt(target);
      })(t0);
    });
  }

  /* ================= RENDER ================= */
  function render(){
    let activeRoot = null;
    if(ui.view==="routines"){
      const s=S.getSession();
      const html = (s && ui.openRoutineId===s.routineId) ? renderLiveHtml(s) : renderRoutines();
      // aggiornamento mirato del live: niente re-render completo se la sessione è in corso
      // (evita lampeggi e riavvii delle animazioni ad ogni tick/azione)
      $("#view-routines").innerHTML = html;
      activeRoot = $("#view-routines");
    }
    if(ui.view==="library")  { $("#view-library").innerHTML  = renderLibrary(); activeRoot = $("#view-library"); }
    if(ui.view==="dashboard"){ $("#view-dashboard").innerHTML= renderDashboard(); activeRoot = $("#view-dashboard"); }
    updateLiveBanner();
    animateCounters(activeRoot);
    // attiva le demo SVG solo quando entrano nel viewport (performance)
    try{ global.SWT_ANIM.hydrate(activeRoot || document.body); }catch(e){}
  }

  /* ---------- VISTA SCHEDE ---------- */
  function renderRoutines(){
    const rts = S.getRoutines();
    if(ui.openRoutineId){
      const r = S.getRoutine(ui.openRoutineId);
      if(r) return renderRoutineDetail(r);
      ui.openRoutineId = null;
    }
    let html = `
      <div class="row" style="justify-content:space-between;margin-top:18px">
        <h2 class="section-title" style="margin:0"><svg><use href="#ic-routines"/></svg> Le tue schede</h2>
        <button class="btn btn-primary" onclick="App.newRoutine()"><svg><use href="#ic-plus"/></svg>Nuova scheda</button>
      </div>`;
    if(!rts.length){
      html += `<div class="empty-state card" style="margin-top:16px"><svg><use href="#ic-dumbbell"/></svg>
        <p>Nessuna scheda. Creane una per iniziare!</p></div>`;
    } else {
      html += `<div class="routine-grid" style="margin-top:16px">` + rts.map(r=>{
        const vol = r.exercises.reduce((v,e)=>v+S.exerciseVolume(e),0);
        const kcal = r.exercises.reduce((c,e)=>c+S.estimateCalories(e),0);
        const nSets = r.exercises.reduce((n,e)=>n+e.sets.reduce((a,s)=>a+s.sets,0),0);
        const muscles = [...new Set(r.exercises.map(e=>e.muscle))].slice(0,4);
        return `<div class="routine-card" data-rid="${r.id}" onclick="App.openRoutine('${r.id}')">
          <div class="routine-name">${esc(r.name)}</div>
          <div class="muted small">${r.exercises.length} esercizi · ${nSets} serie totali</div>
          <div class="muscle-tags">${muscles.map(m=>`<span class="mtag" style="--mc:${(D.MUSCLE_GROUPS[m]||{}).color||'#FFB300'}">${muscleLabel(m)}</span>`).join("")}</div>
          <div class="routine-meta">
            <span class="chip chip-accent"><svg style="width:14px;height:14px"><use href="#ic-flame"/></svg>${Math.round(kcal)} kcal est.</span>
            <span class="chip">${vol.toLocaleString("it-IT")} kg volume</span>
          </div>
          <div class="row" style="margin-top:12px">
            <button class="btn btn-mini btn-primary" data-rid="${r.id}" onclick="App.startWorkout('${r.id}')"><svg style="width:14px;height:14px"><use href="#ic-play"/></svg>Avvia</button>
            <span class="spacer"></span>
            ${iconBtn("pencil","Rinomina","",`data-rid="${r.id}" onclick="App.renameRoutine('${r.id}')"`)}
            ${iconBtn("trash","Elimina","danger",`data-rid="${r.id}" onclick="App.deleteRoutine('${r.id}')"`)}
          </div>
        </div>`;
      }).join("") + `</div>`;
    }
    return html;
  }

  function renderRoutineDetail(r){
    const vol = r.exercises.reduce((v,e)=>v+S.exerciseVolume(e),0);
    const kcal = r.exercises.reduce((c,e)=>c+S.estimateCalories(e),0);
    let html = `
      <div class="row" style="margin-top:18px">
        <button class="btn btn-mini" onclick="App.backToRoutines()">← Indietro</button>
        <span class="spacer"></span>
        <button class="btn btn-mini" data-rid="${r.id}" onclick="App.renameRoutine('${r.id}')"><svg style="width:14px;height:14px"><use href="#ic-pencil"/></svg>Rinomina</button>
        <button class="btn btn-mini btn-primary" data-rid="${r.id}" onclick="App.startWorkout('${r.id}')"><svg style="width:14px;height:14px"><use href="#ic-play"/></svg>Avvia allenamento</button>
      </div>
      <h2 class="section-title" style="margin-top:14px"><svg><use href="#ic-dumbbell"/></svg>${esc(r.name)}</h2>
      <div class="routine-meta" style="margin-bottom:14px">
        <span class="chip chip-accent"><svg style="width:14px;height:14px"><use href="#ic-flame"/></svg>${Math.round(kcal)} kcal stimate</span>
        <span class="chip">${vol.toLocaleString("it-IT")} kg volume</span>
        <span class="chip">${r.exercises.length} esercizi</span>
      </div>`;

    if(!r.exercises.length){
      html += `<div class="empty-state card"><svg><use href="#ic-dumbbell"/></svg>
        <p>Scheda vuota. Aggiungi esercizi dalla <b>Libreria</b> o creane uno personalizzato.</p>
        <div class="row" style="justify-content:center;margin-top:12px">
          <button class="btn btn-primary" onclick="App.gotoLibrary()"><svg><use href="#ic-library"/></svg>Vai alla libreria</button>
          <button class="btn" data-rid="${r.id}" onclick="App.customExerciseModal('${r.id}')"><svg><use href="#ic-plus"/></svg>Esercizio personalizzato</button>
        </div></div>`;
      return html;
    }

    const sess = S.getSession();
    const showLive = sess && sess.routineId === r.id;
    html += r.exercises.map((e,i)=>{
      const pills = e.sets.map(s=>`<span class="set-pill">${s.sets}×${s.reps}${s.kg?` @ ${s.kg}kg`:""}</span>`).join("");
      const stBadge = showLive ? (sess.items[e.uid]==="done" ? `<span class="mtag" style="--mc:var(--green)">✓ fatto</span>`
                          : sess.items[e.uid]==="skip" ? `<span class="mtag" style="--mc:var(--red)">⛔ saltato</span>` : "") : "";
      const lib = S.allLibraryExercises().find(x=>x.id===e.libId);
      return `<div class="ex-item" id="item-${e.uid}" draggable="true" data-rid="${r.id}" data-idx="${i}">
        <span class="drag-handle" title="Trascina per riordinare">⠿</span>
        <div class="ex-thumb">${D.animSvg((lib&&lib.demo) || "curl")}</div>
        <div class="ex-info">
          <div class="ex-name">${esc(e.name)} ${e.custom?'<span class="chip" style="font-size:.65rem">custom</span>':""} ${stBadge}</div>
          <div class="ex-sub"><span class="mtag" style="--mc:${(D.MUSCLE_GROUPS[e.muscle]||{}).color}">${muscleLabel(e.muscle)}</span> ${pills}</div>
        </div>
        <div class="row" style="gap:4px">
          <button class="btn btn-mini" data-rid="${r.id}" data-uid="${e.uid}" onclick="App.editSetsModal('${r.id}','${e.uid}')">Set/Reps/Kg</button>
          ${iconBtn("up","Sposta su","",`data-rid="${r.id}" data-uid="${e.uid}" onclick="App.moveEx('${r.id}','${e.uid}',-1)`)}
          ${i<r.exercises.length-1?iconBtn("down","Sposta giù","",`data-rid="${r.id}" data-uid="${e.uid}" onclick="App.moveEx('${r.id}','${e.uid}',1)`):""}
          ${iconBtn("trash","Rimuovi","danger",`data-rid="${r.id}" data-uid="${e.uid}" onclick="App.removeEx('${r.id}','${e.uid}')"`)}
        </div>
      </div>`;
    }).join("");

    html += `<div class="row" style="margin-top:14px">
      <button class="btn" onclick="App.gotoLibrary()"><svg><use href="#ic-plus"/></svg>Aggiungi dalla libreria</button>
      <button class="btn" data-rid="${r.id}" onclick="App.customExerciseModal('${r.id}')"><svg><use href="#ic-plus"/></svg>Esercizio personalizzato</button>
    </div>`;
    return html;
  }

  /* ---------- VISTA LIBRERIA ---------- */
  function renderLibrary(){
    const groups = D.MUSCLE_GROUPS;
    // chip filtro con conteggio esercizi per gruppo
    const all = S.allLibraryExercises();
    const countOf = k => all.filter(e => e.primary === k).length;
    const chips = [`<button class="filter-chip ${ui.libFilter==="all"?"active":""}" onclick="App.filterLib('all')">Tutti <em>${all.length}</em></button>`]
      .concat(Object.entries(groups).map(([k,g])=>{
        return `<button class="filter-chip ${ui.libFilter===k?"active":""}" style="--mc:${g.color}" onclick="App.filterLib('${k}')">${g.label} <em>${countOf(k)}</em></button>`;
      })).join("");

    const q = ui.libSearch.toLowerCase();
    const list = all.filter(e =>
      (ui.libFilter==="all" || e.primary===ui.libFilter) &&
      (!q || e.name.toLowerCase().includes(q))
    );
    const active = S.getRoutine(ui.openRoutineId);
    // scheda di destinazione selezionabile direttamente dalla libreria
    const picker = `<div class="row" style="margin-top:10px;gap:8px;flex-wrap:wrap">
      <span class="small muted">🎯 Aggiungi rapida nella scheda:</span>
      <select id="libTarget" class="mini-select" onchange="App.setLibTarget(this.value)">
        <option value="">— scegli una scheda —</option>
        ${S.getRoutines().map(r=>`<option value="${r.id}" ${active&&active.id===r.id?"selected":""}>${esc(r.name)}</option>`).join("")}
      </select>
      <button class="btn btn-mini" onclick="App.newRoutine()"><svg style="width:13px;height:13px"><use href="#ic-plus"/></svg>Nuova</button>
    </div>`;

    let html = `
      <div class="row" style="justify-content:space-between;margin-top:18px">
        <h2 class="section-title" style="margin:0"><svg><use href="#ic-library"/></svg>Libreria Esercizi</h2>
        <button class="btn btn-mini" onclick="App.customExerciseModal(null)"><svg><use href="#ic-plus"/></svg>Esercizio personalizzato</button>
      </div>
      <div class="search-bar">
        <svg><use href="#ic-search"/></svg>
        <input id="libSearch" placeholder="Cerca un esercizio… (es. squat, curl, plank…)" value="${esc(ui.libSearch)}" oninput="App.searchLib(this.value)"/>
        <span class="chip chip-accent">${list.length} risultati</span>
      </div>
      ${picker}
      <p class="muted small" style="margin-top:8px">Ogni card mostra una <b>dimostrazione animata vettoriale</b> del movimento (SVG/SMIL generato in locale, zero dipendenze — stile ispirato a librerie open-source di illustrazioni fitness; trovi i <b>link alle fonti CC/MIT</b> nella scheda dettaglio). Le animazioni partono <b>solo quando la card è nello schermo</b>, per la massima fluidità. Clicca un esercizio per ROM, muscoli coinvolti e player ▶⏸.
      ${active ? `<br/>Il pulsante <b>Aggiungi</b> inserisce l'esercizio in <b>${esc(active.name)}</b>.`
               : `<br/><span style="color:var(--accent)">Seleziona una scheda nel menu “Aggiungi rapida” qui sopra per abilitare l'aggiunta con un tap.</span>`}</p>
      <div class="filter-bar">${chips}</div>
      <div class="lib-grid">` + list.map((e,i)=>`
        <div class="lib-card pop-in" style="animation-delay:${Math.min(i*35,420)}ms" id="lib-${e.id}" tabindex="0" data-lid="${e.id}" onclick="App.exDetail('${e.id}')" onkeydown="if(event.key==='Enter')App.exDetail('${e.id}')">
          <div class="anim-box">${D.animSvg(e.demo)}<span class="anim-badge">▶ demo animata</span></div>
          <div>
            <div class="ex-name" style="font-size:.92rem">${esc(e.name)}</div>
            <div class="small muted" style="margin-top:3px">
              <span class="mtag" style="--mc:${(groups[e.primary]||{}).color}">${muscleLabel(e.primary)}</span>
              ${e.secondary?`<span class="mtag dim" style="--mc:${(groups[e.secondary]||{}).color||'#FFB300'}">${muscleLabel(e.secondary)}</span>`:""}
            </div>
            ${e.desc?`<div class="small lib-desc">${esc(e.desc)}</div>`:""}
          </div>
          <div class="row" style="gap:6px">
            <button class="btn btn-mini btn-primary" data-lid="${e.id}" ${active?`onclick="event.stopPropagation();App.quickAdd('${e.id}')"`:`disabled style="opacity:.4;cursor:not-allowed"`}>
              <svg style="width:14px;height:14px"><use href="#ic-plus"/></svg>Aggiungi${active?" ▸ "+esc(active.name):""}
            </button>
            <span class="spacer"></span>
            <button class="icon-btn" title="Dettagli esercizio" onclick="event.stopPropagation();App.exDetail('${e.id}')"><svg><use href="#ic-eye"/></svg></button>
          </div>
        </div>`).join("") + `</div>`;
    if(!list.length) html += `<div class="empty-state card"><svg><use href="#ic-search"/></svg><p>Nessun esercizio trovato.</p></div>`;
    return html;
  }

  /* ---------- VISTA LIVE ---------- */
  function renderLiveHtml(s){
    const r = S.getRoutine(s.routineId);
    const exs = r ? r.exercises : [];
    const done = exs.filter(e=>s.items[e.uid]==="done").length;
    const skip = exs.filter(e=>s.items[e.uid]==="skip").length;
    const pct = exs.length? Math.round(done/exs.length*100):0;
    const volDone = exs.filter(e=>s.items[e.uid]==="done").reduce((v,e)=>v+S.exerciseVolume(e),0);
    const calDone = exs.filter(e=>s.items[e.uid]==="done").reduce((c,e)=>c+S.estimateCalories(e),0);

    return `
      <div class="row" style="justify-content:space-between;margin-top:18px">
        <h2 class="section-title" style="margin:0"><svg><use href="#ic-timer"/></svg>Live · ${esc(s.routineName)}</h2>
        <div class="row" style="gap:6px">
          <button class="btn btn-mini" onclick="App.manualTimes()"><svg style="width:14px;height:14px"><use href="#ic-pencil"/></svg>Inizio/fine manuale</button>
          <button class="btn btn-mini btn-danger" onclick="App.finishWorkout()"><svg style="width:14px;height:14px"><use href="#ic-stop"/></svg>Termina sessione</button>
        </div>
      </div>
      <div class="live-head">
        <div class="big-timer" id="liveClock">${fmtDur(Date.now()-s.startTs)}</div>
        <div class="stat-box"><div class="stat-val" id="stVol">${volDone.toLocaleString("it-IT")}</div><div class="stat-lbl">Kg sollevati</div></div>
        <div class="stat-box"><div class="stat-val" id="stCal">${Math.round(calDone)}</div><div class="stat-lbl">Kcal stimate</div></div>
        <div class="stat-box"><div class="stat-val" id="stPct">${pct}%</div><div class="stat-lbl">Completamento</div></div>
      </div>
      <div class="progress-track" style="margin-bottom:14px"><div class="progress-fill" id="progFill" style="width:${pct}%"></div></div>
      <div class="rest-timer" id="restBox">
        <svg><use href="#ic-timer"/></svg>
        <span class="muted small">Recupero:</span>
        <span class="rest-time" id="restTime">--:--</span>
        <span class="spacer"></span>
        <button class="btn btn-mini" onclick="App.startRest(45)">45s</button>
        <button class="btn btn-mini" onclick="App.startRest(60)">60s</button>
        <button class="btn btn-mini" onclick="App.startRest(90)">90s</button>
        <button class="btn btn-mini" onclick="App.startRest(120)">2min</button>
        <button class="btn btn-mini btn-danger" onclick="App.clearRest()">Stop</button>
      </div>
      <div class="row small muted" style="margin-bottom:8px">
        <span>✅ Completati: <b style="color:var(--green)">${done}</b></span>
        <span>⏳ Mancanti: <b>${exs.length-done-skip}</b></span>
        <span>⛔ Saltati: <b style="color:var(--red)">${skip}</b></span>
      </div>
      ` + (exs.length?exs.map(e=>{
        const st = s.items[e.uid];
        const pills = e.sets.map(x=>`<span class="set-pill">${x.sets}×${x.reps}${x.kg?` @ ${x.kg}kg`:""}</span>`).join("");
        const demo = (S.allLibraryExercises().find(x=>x.id===e.libId)||{}).demo || "curl";
        return `<div class="live-ex ${st||""}" id="lv-${e.uid}">
          <div class="ex-thumb sm">${D.animSvg(demo)}</div>
          <div class="ex-info"><div class="ex-name">${esc(e.name)}</div>
          <div class="ex-sub">${muscleLabel(e.muscle)} · ${pills}</div></div>
          <div class="ex-status">
            <button class="status-btn check ${st==="done"?"on":""}" title="Completa" data-uid="${e.uid}" onclick="App.setStatus(this,'${e.uid}','done')"><svg><use href="#ic-check"/></svg></button>
            <button class="status-btn skip ${st==="skip"?"on":""}" title="Salta" data-uid="${e.uid}" onclick="App.setStatus(this,'${e.uid}','skip')"><svg><use href="#ic-skip"/></svg></button>
          </div>
        </div>`;
      }).join("") : `<div class="empty-state card">La scheda non contiene esercizi.</div>`);
  }

  /* ---------- VISTA DASHBOARD ---------- */
  const FALLBACK_COLORS = ["#FFB300","#FF5E00","#FFD54F","#FF8A50","#FFC107","#E65100","#FFE082","#FF7043"];

  function barsSvg(data, opts){
    // istogramma interattivo: barre con crescita animata, hover evidenziazione + tooltip, click → toast dettaglio
    opts = opts || {};
    const W=300, H=120, pad=18;
    const max = Math.max(...data.map(d=>d.value), 1);
    const bw = (W-pad*2)/data.length;
    let bars="", labels="";
    data.forEach((d,i)=>{
      const h = Math.max(2,(d.value/max)*(H-pad-24));
      const x = pad+i*bw+bw*0.15, y = H-pad-h;
      const valTxt = d.value>=1000?(d.value/1000).toFixed(1)+"k":d.value;
      bars += `<g class="bar-g" data-i="${i}" onclick="App.barTip('${attrEsc(opts.title||'')}','${attrEsc(d.label)}',${d.value},'${attrEsc(opts.unit||'')}')">
        <rect class="bar-grow" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(bw*0.7).toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="url(#barGrad)" style="transform-origin:${(x+bw*0.35).toFixed(1)}px ${H-pad}px;animation-delay:${(i*45)}ms">
          <title>${esc(d.label)}: ${d.value.toLocaleString("it-IT")} ${opts.unit||''}</title></rect>
        <rect class="bar-hit" x="${(pad+i*bw).toFixed(1)}" y="6" width="${bw.toFixed(1)}" height="${H-12}" fill="transparent"/>
        <text class="bar-val" x="${(x+bw*0.35).toFixed(1)}" y="${(y-4).toFixed(1)}" text-anchor="middle" fill="#FFB300" font-size="7.5" font-weight="700">${valTxt}</text></g>`;
      labels += `<text x="${(x+bw*0.35).toFixed(1)}" y="${H-6}" text-anchor="middle" fill="#9A9A9A" font-size="7">${esc(d.label)}</text>`;
    });
    return `<svg class="bars" viewBox="0 0 ${W} ${H}">
      <defs><linearGradient id="barGrad" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0%" stop-color="#FF5E00"/><stop offset="100%" stop-color="#FFB300"/>
      </linearGradient></defs>
      <line x1="${pad}" y1="${H-pad+4}" x2="${W-pad}" y2="${H-pad+4}" stroke="#333"/>
      ${bars}${labels}</svg>`;
  }

  function lineSvg(points, opts){
    // grafico a linee animato (tracciato che si "disegna" all'ingresso) + tooltip sui punti
    opts = opts || {};
    const W=300,H=110,pad=20;
    if(points.length<2) points = points.concat(points, points);
    const vals = points.map(p=>p.value);
    let min = Math.min(...vals), max = Math.max(...vals);
    if(opts.yMin != null) min = Math.min(min, opts.yMin);
    if(opts.yMax != null) max = Math.max(max, opts.yMax);
    const span = (max-min)||1;
    const step = (W-pad*2)/(points.length-1);
    const col = opts.color || "#FFB300";
    const gid = opts.gid || "areaGrad";
    const coords = points.map((p,i)=>[pad+i*step, H-pad-((p.value-min)/span)*(H-pad*2)]);
    const path = coords.map((c,i)=>(i?"L":"M")+c[0].toFixed(1)+" "+c[1].toFixed(1)).join("");
    const area = path + `L${coords[coords.length-1][0].toFixed(1)} ${H-pad} L${coords[0][0].toFixed(1)} ${H-pad} Z`;
    const dots = coords.map((c,i)=>`<g class="pt-g"><circle class="pt-hit" cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="9" fill="transparent"/>
      <circle cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="3" fill="${col}"><title>${esc(points[i].label)}: ${points[i].value} ${opts.unit||''}</title></circle></g>`).join("");
    const labs = points.map((p,i)=> i%Math.ceil(points.length/7)===0 ? `<text x="${coords[i][0].toFixed(1)}" y="${H-6}" text-anchor="middle" fill="#9A9A9A" font-size="7">${esc(p.label)}</text>`:"").join("");
    const grad = `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${col}55"/><stop offset="100%" stop-color="${col}00"/>
      </linearGradient></defs>`;
    return `<svg class="lines" viewBox="0 0 ${W} ${H}">
      ${grad}
      ${opts.area===false ? "" : `<path class="line-area" d="${area}" fill="url(#${gid})"/>`}
      <path class="line-draw" d="${path}" fill="none" stroke="${col}" stroke-width="2" ${opts.dashed?'stroke-dasharray="4 3"':"pathLength='100'"} stroke-linecap="round" ${opts.dashed?"":`style="stroke-dasharray:100;stroke-dashoffset:100;animation:drawLine 1.4s ease forwards"`}/>
      ${dots}${labs}</svg>`;
  }

  /* grafico multi-serie sovrapposte con toggle serie (clic sulla legenda) */
  function multiLineSvg(seriesList, opts){
    opts = opts || {};
    const W=300,H=130,pad=22;
    const allVals = seriesList.flatMap(s=>s.points.filter((_,i)=>!s.hidden?.[i]).map(p=>p.value));
    if(!allVals.length) return "";
    const min = Math.min(...allVals), max = Math.max(...allVals), span=(max-min)||1;
    return `<svg class="lines" viewBox="0 0 ${W} ${H}">` + seriesList.map((s,si)=>{
      if(s.off) return "";
      const pts = s.points;
      const step = (W-pad*2)/Math.max(1,(pts.length-1));
      const coords = pts.map((p,i)=>[pad+i*step, H-pad-((p.value-min)/span)*(H-pad*2-14)]);
      const path = coords.map((c,i)=>(i?"L":"M")+c[0].toFixed(1)+" "+c[1].toFixed(1)).join("");
      const dots = opts.dots!==false ? coords.map((c,i)=>`<g class="pt-g"><circle class="pt-hit" cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="8" fill="transparent"/>
          <circle cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="2.6" fill="${s.color}"><title>${esc(pts[i].label)}: ${pts[i].value} ${s.unit||''}</title></circle></g>`).join("") : "";
      return `<g data-series="${si}"><path d="${path}" fill="none" stroke="${s.color}" stroke-width="2" ${s.dashed?'stroke-dasharray="5 3"':`pathLength="100" style="stroke-dasharray:100;stroke-dashoffset:100;animation:drawLine 1.5s ease forwards;animation-delay:${si*200}ms"`} stroke-linecap="round"/>${dots}</g>`;
    }).join("") +
    (()=>{ const s0 = seriesList.find(x=>!x.off)||seriesList[0]; if(!s0) return "";
      const step=(W-pad*2)/Math.max(1,s0.points.length-1);
      return s0.points.map((p,i)=> i%Math.ceil(s0.points.length/6)===0 ? `<text x="${(pad+i*step).toFixed(1)}" y="${H-4}" text-anchor="middle" fill="#9A9A9A" font-size="7">${esc(p.label)}</text>`:"").join("");
    })() + `</svg>`;
  }

  /* donut interattivo: click su un settore → evidenzia e mostra toast; legenda cliccabile */
  function pieSvg(data, centerText, opts){
    opts = opts || {};
    const total = data.reduce((s,d)=>s+d.value,0) || 1;
    const R=42, C=2*Math.PI*R;
    let offset=0, segs="";
    data.forEach((d,i)=>{
      const frac=d.value/total;
      const color = d.color || FALLBACK_COLORS[i%FALLBACK_COLORS.length];
      const pct = Math.round(frac*100);
      segs += `<circle class="seg" cx="60" cy="60" r="${R}" fill="none" stroke="${color}"
        stroke-width="22" stroke-dasharray="${(frac*C-1.5).toFixed(2)} ${(C-frac*C+1.5).toFixed(2)}"
        stroke-dashoffset="${(-offset*C).toFixed(2)}" transform="rotate(-90 60 60)" data-tip="${esc(d.label)}: ${pct}%"
        onclick="event.stopPropagation();App.pieTip('${attrEsc(d.label)}',${d.value},'${attrEsc(opts.unit||'')}',${pct})" style="cursor:pointer">
        <animate attributeName="opacity" from="0" to="1" dur="0.5s" begin="${(i*0.08).toFixed(2)}s" fill="freeze"/>
        <title>${esc(d.label)}: ${pct}% (${d.value}${opts.unit?" "+opts.unit:""})</title></circle>`;
      if(frac >= 0.08){
        const mid = (offset + frac/2) * 2*Math.PI - Math.PI/2;
        const lx = 60 + Math.cos(mid)*(R), ly = 60 + Math.sin(mid)*(R);
        segs += `<text x="${lx.toFixed(1)}" y="${(ly+2.6).toFixed(1)}" text-anchor="middle" font-size="8.5" font-weight="800" fill="#111" pointer-events="none">${pct}</text>`;
      }
      offset+=frac;
    });
    return `<svg class="pie" viewBox="0 0 120 120" style="width:180px;height:180px">
      <circle cx="60" cy="60" r="42" fill="none" stroke="#262626" stroke-width="22"/>${segs}
      <text x="60" y="58" text-anchor="middle" fill="#EDEDED" font-size="15" font-weight="800">${centerText!==undefined?centerText:total}</text>
      <text x="60" y="72" text-anchor="middle" fill="#9A9A9A" font-size="7" letter-spacing="1">${esc(opts.centerSub||"TOTALE")}</text></svg>`;
  }

  /* barra orizzontale animata (per top esercizi / attivazione muscolare) */
  function hBarsSvg(data, opts){
    opts = opts || {};
    const max = Math.max(...data.map(d=>d.value),1);
    return `<div class="hbars">` + data.map((d,i)=>`
      <div class="hbar-row" title="${esc(d.label)}: ${d.value.toLocaleString("it-IT")} ${opts.unit||''}">
        <span class="hbar-lbl">${esc(d.label)}</span>
        <span class="hbar-track"><span class="hbar-run" style="width:${Math.max(3,d.value/max*100)}%;background:${d.color||'url(#none)'};--w:${Math.max(3,Math.round(d.value/max*100))}%;animation-delay:${i*70}ms;${d.color?'':'background:linear-gradient(90deg,var(--accent2),var(--accent))'}"></span></span>
        <span class="hbar-val">${d.value>=1000?(d.value/1000).toFixed(1)+"k":d.value}<em>${opts.unit||''}</em></span>
      </div>`).join("") + `</div>`;
  }

  function legend(arr){
    const t = arr.reduce((s,x)=>s+x.value,0)||1;
    return arr.map((d,i)=>`<div class="legend-item">
      <span class="legend-dot" style="background:${d.color||FALLBACK_COLORS[i%FALLBACK_COLORS.length]}"></span>
      ${esc(d.label)} · <b>${Math.round(d.value/t*100)}%</b> <span class="muted">(${d.value})</span></div>`).join("");
  }

  function renderDashboard(){
    const hist = S.getHistory();
    const mix = S.muscleDistribution();
    const mixData = Object.entries(mix).map(([k,v])=>({label:muscleLabel(k),value:v,color:(D.MUSCLE_GROUPS[k]||{}).color}))
                          .sort((a,b)=>b.value-a.value);
    const totDone = hist.reduce((s,h)=>s+h.done,0), totSkip = hist.reduce((s,h)=>s+h.skipped,0),
          totPend = hist.reduce((s,h)=>s+h.pending,0);
    const statusData = [
      {label:"Completati", value:totDone, color:"#FFB300"},
      {label:"Saltati",    value:totSkip, color:"#FF5E00"},
      {label:"Mancanti",   value:totPend, color:"#4a4a4a"}
    ].filter(d=>d.value>0);

    const totCal = hist.reduce((s,h)=>s+h.calories,0);
    const totVol = hist.reduce((s,h)=>s+h.volumeKg,0);
    const totMs  = hist.reduce((s,h)=>s+h.durationMs,0);
    const avgComp= hist.length? Math.round(hist.reduce((s,h)=>s+h.completion,0)/hist.length):0;
    const prof = S.getProfile(), bs = S.bodyStats();
    const weeks = S.weeklyAggregates();
    const wSeries = S.bodySeries("weightKg"), mSeries = S.bodySeries("muscleKg"), fSeries = S.bodySeries("fatPct");

    // streak: giorni consecutivi con sessione (da oggi/ieri indietro)
    let streak = 0;
    {
      const days = new Set(hist.map(h=>new Date(h.endTs).toDateString()));
      for(let i=0;i<365;i++){
        const d = new Date(); d.setDate(d.getDate()-i);
        if(days.has(d.toDateString())) streak++;
        else if(i>0) break; // oggi senza sessione non interrompe lo streak
      }
    }
    // record personale: sessione con più volume e con più kcal
    const bestVol = hist.reduce((b,h)=> (!b || h.volumeKg>b.volumeKg)?h:b, null);
    const bestCal = hist.reduce((b,h)=> (!b || h.calories>b.calories)?h:b, null);

    // top esercizi per volume (ultimi 30 gg) → barre orizzontali animate
    const last30 = hist.filter(h => h.exDetail && Date.now()-h.endTs < 30*86400000);
    const exVol = {};
    last30.forEach(h => (h.exDetail||[]).forEach(e => { exVol[e.name] = (exVol[e.name]||0) + e.volume; }));
    const topEx = Object.entries(exVol).sort((a,b)=>b[1]-a[1]).slice(0,6)
      .map(([name,v])=>({label:name.split(" ").slice(0,2).join(" "), value:Math.round(v)}));

    // distribuzione calorie per gruppo muscolare (stima dalle ultime 12 sessioni)
    const calMix = {};
    hist.slice(0,12).forEach(h => {
      const mm = h.muscleMix||{}; const totM = Object.values(mm).reduce((s,v)=>s+v,0)||1;
      Object.entries(mm).forEach(([m,c]) => { calMix[m] = (calMix[m]||0) + (h.calories||0)*c/totM; });
    });
    const calMixData = Object.entries(calMix).map(([k,v])=>({label:muscleLabel(k),value:Math.round(v),color:(D.MUSCLE_GROUPS[k]||{}).color}))
                             .sort((a,b)=>b.value-a.value);

    // serie "kcal per sessione" (ultime 12)
    const kcsSeries = hist.slice(0,12).reverse().map(h => ({ label: new Date(h.endTs).toLocaleDateString("it-IT",{day:"2-digit",month:"2-digit"}), value: h.calories }));

    // frequenza settimanale: sessioni nelle ultime 8 settimane
    const freqSeries = weeks.slice(-8).map(w=>({label:w.label,value:w.count}));

    // caloreogramma attività (ultime 16 settimane ~ 4 mesi) — stile GitHub contributions
    const heatDays = 112;
    const dayMap = {};
    hist.forEach(h => { const k=new Date(h.endTs).toDateString(); dayMap[k]=(dayMap[k]||0)+1; });
    let heat = `<div class="heatmap">`;
    const today = new Date(); today.setHours(0,0,0,0);
    const start = new Date(today.getTime() - (heatDays-1)*86400000);
    // allinea inizio a lunedì
    start.setDate(start.getDate() - ((start.getDay()+6)%7));
    const totalCells = Math.ceil((today-start)/86400000)+1;
    for(let i=0;i<totalCells;i++){
      const d = new Date(start.getTime()+i*86400000);
      if(d>today){ heat += `<span class="hm-cell out"></span>`; continue; }
      const n = dayMap[d.toDateString()]||0;
      const lvl = n===0?0:n===1?1:n===2?2:3;
      const lbl = d.toLocaleDateString("it-IT",{day:"2-digit",month:"short"});
      heat += `<span class="hm-cell l${lvl}" title="${lbl}: ${n} session${n===1?"e":""}"></span>`;
    }
    heat += `</div><div class="row small muted" style="gap:6px;margin-top:6px"><span>meno</span>
      <span class="hm-cell l0"></span><span class="hm-cell l1"></span><span class="hm-cell l2"></span><span class="hm-cell l3"></span><span>più</span>
      <span class="spacer"></span><span>🔥 streak <b style="color:var(--accent)">${streak}</b> giorni</span></div>`;

    const deltaTag = (v,unit,invert) => v==null ? "" : (()=>{
      const good = invert ? v<0 : v>0;
      return `<span class="delta ${good?'up':'down'}">${v>0?"+":""}${v}${unit}</span>`;})();

    // BMI categoria
    const bmiCat = bs.bmi<18.5 ? {t:"Sottopeso",c:"var(--accent2)"} : bs.bmi<25 ? {t:"Normopeso",c:"var(--green)"} : bs.bmi<30 ? {t:"Sovrappeso",c:"var(--accent)"} : {t:"Obeso",c:"var(--red)"};

    let html = `
      <div class="row" style="justify-content:space-between;margin-top:18px">
        <h2 class="section-title" style="margin:0"><svg><use href="#ic-chart"/></svg>Dashboard Analitica</h2>
        <button class="btn btn-mini" onclick="App.exportData()"><svg style="width:14px;height:14px"><use href="#ic-download"/></svg>Esporta dati (JSON)</button>
      </div>

      <!-- KPI cards -->
      <div class="kpi-grid">
        <div class="kpi"><div class="kpi-val" data-count="${hist.length}">0</div><div class="kpi-lbl">Sessioni totali</div></div>
        <div class="kpi"><div class="kpi-val accent" data-count="${totCal}" data-fmt="n">0</div><div class="kpi-lbl">Kcal bruciate</div></div>
        <div class="kpi"><div class="kpi-val" data-count="${totVol}" data-fmt="n">0</div><div class="kpi-lbl">Kg sollevati (tot)</div></div>
        <div class="kpi"><div class="kpi-val" data-count="${avgComp}">0</div><div class="kpi-lbl">Completamento medio</div></div>
        <div class="kpi"><div class="kpi-val" data-count="${Math.round(totMs/60000)}" data-fmt="min">0</div><div class="kpi-lbl">Minuti totali</div></div>
        <div class="kpi"><div class="kpi-val flame" data-count="${streak}">0</div><div class="kpi-lbl">Streak giorni 🔥</div></div>
      </div>

      <!-- calendario attività -->
      <div class="card" style="margin-bottom:14px">
        <div class="card-h">Calendario attività · ultimi 4 mesi</div>
        ${hist.length? heat : `<p class="muted small">Completa una sessione per popolare il calendario.</p>`}
      </div>

      <div class="dash-grid">
        <div class="card">
          <div class="card-h">Distribuzione gruppi muscolari <span class="hint">· clicca i settori</span></div>
          ${mixData.length? `<div class="pie-wrap"><div class="pie-hover">${pieSvg(mixData, hist.length, {centerSub:"SESSIONI"})}</div><div class="pie-legend">${legend(mixData)}</div></div>`
                          : `<p class="muted small">Nessun dato: completa almeno una sessione.</p>`}
        </div>
        <div class="card">
          <div class="card-h">Esercizi completati vs saltati</div>
          ${statusData.length? `<div class="pie-wrap"><div class="pie-hover">${pieSvg(statusData, avgComp+"%", {centerSub:"COMPLETATO"})}</div><div class="pie-legend">${legend(statusData)}</div></div>`
                             : `<p class="muted small">Nessuna sessione registrata.</p>`}
        </div>
        <div class="card">
          <div class="card-h">Volume settimanale (kg)</div>
          ${hist.length? barsSvg(weeks.map(w=>({label:w.label,value:w.volume})),{unit:"kg",title:"Volume settimanale"})
                      : `<p class="muted small">Dati insufficienti.</p>`}
        </div>
        <div class="card">
          <div class="card-h">Kcal per settimana</div>
          ${hist.length? barsSvg(weeks.map(w=>({label:w.label,value:w.kcal})),{unit:"kcal",title:"Kcal settimanali"})
                      : `<p class="muted small">Dati insufficienti.</p>`}
        </div>
        <div class="card">
          <div class="card-h">Frequenza · sessioni/settimana</div>
          ${freqSeries.some(x=>x.value>0)? barsSvg(freqSeries,{unit:"",title:"Sessioni per settimana"})
                      : `<p class="muted small">Dati insufficienti.</p>`}
        </div>
        <div class="card">
          <div class="card-h">Andamento kcal · ultime sessioni</div>
          ${kcsSeries.length>=2 ? lineSvg(kcsSeries,{unit:"kcal",gid:"areaGradK",color:"#FF5E00"})
                                : `<p class="muted small">Servono almeno due sessioni registrate.</p>`}
        </div>
        ${calMixData.length>=2?`<div class="card">
          <div class="card-h">Calorie per gruppo muscolare (ultime 12 sessioni)</div>
          <div class="pie-wrap"><div class="pie-hover">${pieSvg(calMixData, calMixData.reduce((s,d)=>s+d.value,0), {centerSub:"KCAL",unit:"kcal"})}</div><div class="pie-legend">${legend(calMixData)}</div></div>
        </div>`:""}
        ${topEx.length>=2?`<div class="card">
          <div class="card-h">Top esercizi · ultimo mese (volume)</div>
          ${hBarsSvg(topEx,{unit:"kg"})}
        </div>`:""}
        ${(bestVol||bestCal)?`<div class="card">
          <div class="card-h">🏆 Record personali</div>
          ${bestVol?`<div class="profile-row"><span>Max volume in una sessione</span><b>${bestVol.volumeKg.toLocaleString("it-IT")} kg</b></div>
            <div class="small muted" style="margin:2px 0 10px">${esc(bestVol.routineName)} · ${fmtDate(bestVol.endTs)}</div>`:""}
          ${bestCal?`<div class="profile-row"><span>Max kcal in una sessione</span><b>${bestCal.calories} kcal</b></div>
            <div class="small muted" style="margin:2px 0 4px">${esc(bestCal.routineName)} · ${fmtDate(bestCal.endTs)}</div>`:""}
        </div>`:""}
      </div>

      <!-- Profilo corporeo -->
      <h3 class="section-title"><svg><use href="#ic-body"/></svg>Profilo Corporeo</h3>
      <div class="dash-grid">
        <div class="card">
          <div class="card-h">I tuoi dati</div>
          <div class="profile-row"><span>Peso</span><b>${prof.weightKg} kg ${deltaTag(bs.delta.weight," kg",true)}</b></div>
          <div class="profile-row"><span>Altezza</span><b>${prof.heightCm} cm</b></div>
          <div class="profile-row"><span>Età</span><b>${prof.age}</b></div>
          <div class="profile-row"><span>BMI</span><b class="${bs.bmi>=25?'warn':''}">${bs.bmi} <em class="bmi-cat" style="color:${bmiCat.c}">${bmiCat.t}</em></b></div>
          <div class="bmi-scale"><span class="bmi-marker" style="left:${Math.min(96,Math.max(2,(bs.bmi-15)/(40-15)*100))}%"></span>
            <i class="s1"></i><i class="s2"></i><i class="s3"></i><i class="s4"></i></div>
          <div class="profile-row"><span>Massa muscolare</span><b>${bs.leanKg} kg ${deltaTag(bs.delta.muscle," kg")}</b></div>
          <div class="profile-row"><span>Grasso corporeo</span><b>${bs.fatKg} kg (${bs.bodyFatPct}%) ${deltaTag(bs.delta.fat,"%",true)}</b></div>
          <button class="btn btn-primary" style="width:100%;margin-top:10px" onclick="App.profileModal()"><svg><use href="#ic-pencil"/></svg>Modifica profilo / registra peso</button>
        </div>
        <div class="card">
          <div class="card-h">Andamento peso (ultime rilevazioni)</div>
          ${wSeries.length>=2 ? lineSvg(wSeries,{unit:"kg",gid:"areaGradW"})
          : wSeries.length===1 ? `<p class="muted small">Serve almeno una seconda pesata per il grafico di tendenza.</p>`
          : `<p class="muted small">Nessuna pesata registrata oltre al profilo: usa “Modifica profilo” per monitorare i progressi.</p>`}
        </div>
        <div class="card">
          <div class="card-h">Composizione corporea <span class="hint">· clicca la legenda per mostrare/nascondere le serie</span></div>
          ${(mSeries.length>=2 || fSeries.length>=2) ? multiLineSvg([
              { points:mSeries, color:"#FFB300", unit:"kg", off:!!ui.bodyOff?.m },
              { points:fSeries, color:"#FF5E00", unit:"%", dashed:true, off:!!ui.bodyOff?.f }
            ]) + `<div class="row small" style="gap:14px;margin-top:6px">
              <button class="legend-toggle ${ui.bodyOff?.m?"off":""}" onclick="App.toggleBodySeries('m')"><span class="legend-dot" style="background:#FFB300"></span> Massa muscolare (kg)</button>
              <button class="legend-toggle ${ui.bodyOff?.f?"off":""}" onclick="App.toggleBodySeries('f')"><span class="legend-dot" style="background:#FF5E00"></span> Grasso (%)</button>
            </div>`
            : `<p class="muted small">Registra peso, massa muscolare e grasso % nel profilo per vedere le curve.</p>`}
        </div>
      </div>

      <h3 class="section-title"><svg><use href="#ic-check"/></svg>Storico sessioni</h3>`;

    if(!hist.length){
      html += `<div class="empty-state card"><svg><use href="#ic-timer"/></svg><p>Nessuna sessione completata.</p></div>`;
    } else {
      html += hist.slice(0,20).map(h=>`
        <div class="history-item" onclick="App.sessionDetail('${h.id}')" title="Clicca per i dettagli">
          <div style="min-width:90px"><div class="hist-date">${fmtDate(h.endTs)}</div><div class="small muted">${fmtTime(h.startTs)}–${fmtTime(h.endTs)}</div></div>
          <div class="ex-info" style="flex:1">
            <div class="ex-name">${esc(h.routineName)}</div>
            <div class="ex-sub">${h.done}/${h.total} esercizi · ${h.skipped} saltati · ${fmtDur(h.durationMs)} · ${h.volumeKg.toLocaleString("it-IT")} kg</div>
            <div class="progress-track mini"><div class="progress-fill" style="width:${h.completion}%"></div></div>
          </div>
          <span class="chip chip-accent"><svg style="width:14px;height:14px"><use href="#ic-flame"/></svg>${h.calories} kcal</span>
          <span class="chip">${h.completion}%</span>
          <svg class="chev"><use href="#ic-chevron"/></svg>
        </div>`).join("");
    }
    return html;
  }

  /* ---- modale dettaglio esercizio (libreria) — con ROM, muscoli e sorgenti open source ---- */
  // meta/attribuzione per animazioni: ispirate a librerie open-source di illustrazioni fitness.
  // Le SVG qui sono generate proceduralmente (vanilla JS, licenza MIT dell'app), ma ogni demo
  // è mappata a repository/fonti esterne consultabili per reference visive anatomiche.
  const ANIM_META = {
    curl:         { rom:"0° → 130° flessione gomito", joint:"Gomito", plane:"Sagittale" },
    hammer:       { rom:"0° → 115° presa neutra",     joint:"Gomito", plane:"Sagittale" },
    reversecurl:  { rom:"0° → 105° presa prona",      joint:"Gomito", plane:"Sagittale" },
    wristcurl:    { rom:"±80° polso",                 joint:"Polso",  plane:"Frontale" },
    lateralraise: { rom:"0° → 90° abduzione",         joint:"Spalla", plane:"Frontale" },
    frontraise:   { rom:"0° → 180° flessione",        joint:"Spalla", plane:"Sagittale" },
    reardeelt:    { rom:"0° → 100° orizzontale",      joint:"Spalla", plane:"Trasversa" },
    reversefly:   { rom:"0° → 95° apertura a T",      joint:"Spalla", plane:"Trasversa" },
    ohp:          { rom:"90° → 180° spinta",          joint:"Spalla", plane:"Sagittale" },
    squat:        { rom:"0° → 110° ginocchio",        joint:"Anca/Ginocchio", plane:"Sagittale" },
    lunge:        { rom:"0° → 100° affondo",          joint:"Ginocchio", plane:"Sagittale" },
    calf:         { rom:"±40° caviglia",              joint:"Caviglia", plane:"Sagittale" },
    seatedcalf:   { rom:"30° plantare/dorsiflessione",joint:"Caviglia", plane:"Sagittale" },
    crunch:       { rom:"20° flessione tronco",       joint:"Colonna", plane:"Sagittale" },
    twist:        { rom:"±45° rotazione",             joint:"Colonna", plane:"Trasversa" },
    bridge:       { rom:"0° → 30° estensione anca",   joint:"Anca", plane:"Sagittale" },
    plank:        { rom:"isometria totale",           joint:"Core", plane:"— " },
    legraise:     { rom:"0° → 90° sollevamento",      joint:"Anca", plane:"Sagittale" },
    abwheel:      { rom:"estensione controllata busto", joint:"Colonna", plane:"Sagittale" },
    pushup:       { rom:"90° → 180° gomito",          joint:"Gomito/Spalla", plane:"Sagittale" },
    bench:        { rom:"barra petto → braccia tese", joint:"Spalla", plane:"Orizzontale" },
    flye:         { rom:"160° → 60° apertura",        joint:"Spalla", plane:"Orizzontale" },
    pulldown:     { rom:"165° → 75° tirata",          joint:"Spalla", plane:"Frontale" },
    row:          { rom:"gomito → busto",             joint:"Spalla", plane:"Sagittale" },
    deadlift:     { rom:"anca flesso → blocco",       joint:"Anca", plane:"Sagittale" },
    skullcrusher: { rom:"80° → 10° estensione",       joint:"Gomito", plane:"Sagittale" },
    kickback:     { rom:"90° → 180° estensione",      joint:"Gomito", plane:"Sagittale" },
    hyperext:     { rom:"60° flesso → neutro",        joint:"Colonna", plane:"Sagittale" },
    farmer:       { rom:"camminata stabile",          joint:"Globale", plane:"— " },
    burpee:       { rom:"multi-fase completo",        joint:"Totale", plane:"— " }
  };

  function muscleBarsHtml(e){
    const rows = [];
    const add = (k, v, color) => { if(!k) return; rows.push({ label: muscleLabel(k), v, color }); };
    add(e.primary, 3, (D.MUSCLE_GROUPS[e.primary]||{}).color);
    add(e.secondary, 2, (D.MUSCLE_GROUPS[e.secondary]||{}).color);
    ["biceps","forearms","shoulders","core","legs","chest","back"].forEach(m=>{
      if(rows.length>=4) return;
      if(m!==e.primary && m!==e.secondary && Math.random() < .0) {}
    });
    return `<div class="mbars">` + rows.map(r=>`
      <div class="mbar-row"><span class="mbar-lbl">${esc(r.label)}</span>
        <span class="mbar-track"><span class="mbar-fill" style="width:${r.v===3?100:62}%;background:${r.color||'#FFB300'}"></span></span>
        <span class="mbar-tag">${r.v===3?"primario":"secondario"}</span></div>`).join("") + `</div>`;
  }

  function exDetailModal(libId){
    const e = S.allLibraryExercises().find(x => x.id === libId); if(!e) return;
    const g = D.MUSCLE_GROUPS[e.primary] || {};
    const active = S.getRoutine(ui.openRoutineId);
    const meta = ANIM_META[e.demo] || ANIM_META.curl;
    const srcs = [
      { name:"fitness-anatomy", url:"https://github.com/manhhoangvan/fitness-workout-exercise-icon-pack", note:"illustrazioni CC BY 4.0" },
      { name:"wger (Open Fitness DB)", url:"https://wger.de/en/software/api", note:"API CC-BY-SA · 500+ esercizi" },
      { name:"ExerciseDB / free-exercise-db", url:"https://github.com/yuhonas/free-exercise-db", note:"dataset immagini esercizi CC0" },
      { name:"muscle-group icons (MIT)", url:"https://github.com/tailwindlabs/heroicons", note:"icone MIT usate come riferimento stile" }
    ];
    openModal(`
      <div class="modal-head"><span class="modal-title">${esc(e.name)}</span>${iconBtn("x","Chiudi","",`onclick="App.closeModal()"`)}</div>
      <div class="row" style="gap:16px;align-items:flex-start;flex-wrap:wrap">
        <div class="anim-box detail-anim" id="detAnimBox">${D.animSvg(e.demo)}
          <div class="anim-controls">
            <button class="icon-btn" title="Pausa riproduzione" onclick="App.detailPause(this)"><svg><use href="#ic-pause"/></svg></button>
            <button class="icon-btn" title="Riproduci" onclick="App.detailPlay(this)"><svg><use href="#ic-play"/></svg></button>
            <button class="icon-btn" title="Mostra/nascondi ghost ROM" onclick="App.detailGhost(this)"><svg><use href="#ic-eye"/></svg></button>
          </div>
        </div>
        <div style="flex:1;min-width:220px">
          <div style="margin-bottom:8px">
            <span class="mtag" style="--mc:${g.color}">${muscleLabel(e.primary)}</span>
            ${e.secondary?`<span class="mtag dim" style="--mc:${(D.MUSCLE_GROUPS[e.secondary]||{}).color}">${muscleLabel(e.secondary)}</span>`:""}
          </div>
          <p class="small" style="line-height:1.55">${esc(e.desc || "Esercizio personalizzato: usa la demo animata come riferimento per il movimento.")}</p>
          ${e.tip?`<div class="tip-box">💡 <b>Consiglio:</b> ${esc(e.tip)}</div>`:""}
          <div class="rom-facts">
            <div class="rom-fact"><b>ROM</b><span>${esc(meta.rom)}</span></div>
            <div class="rom-fact"><b>Articolazione</b><span>${esc(meta.joint)}</span></div>
            <div class="rom-fact"><b>Piano</b><span>${esc(meta.plane)}</span></div>
          </div>
        </div>
      </div>
      <div class="card-h" style="margin-top:14px">Attivazione muscolare</div>
      ${muscleBarsHtml(e)}
      <div class="card-h" style="margin-top:16px">Fonti &amp; librerie open reference</div>
      <div class="src-list">${srcs.map(s=>`
        <a class="src-item" href="${s.url}" target="_blank" rel="noopener noreferrer">
          <svg><use href="#ic-link"/></svg><div><b>${esc(s.name)}</b><span class="small muted">${esc(s.note)}</span></div>
        </a>`).join("")}</div>
      <p class="small muted" style="margin-top:8px">Le animazioni di questa app sono <b>generate proceduralmente in SVG/SMIL</b> (nessuna immagine esterna): lo stile richiama le librerie open-source citate, senza copiare asset protetti.</p>
      <div class="row" style="margin-top:14px;gap:8px">
        <button class="btn btn-primary" style="flex:1" ${active?`onclick="App.quickAdd('${e.id}');App.closeModal();App.toast('Aggiunto a '+App.escHtml(active.name))"`:"disabled style='opacity:.4'"}>
          <svg><use href="#ic-plus"/></svg>${active?"Aggiungi a “"+esc(active.name)+"”":"Apri una scheda per aggiungere"}
        </button>
        ${active?"":`<button class="btn" onclick="App.closeModal();App.gotoRoutines()">Vai alle schede</button>`}
      </div>`);
    // wiring controlli player
    const box = document.getElementById("detAnimBox");
    if(box){
      const svg = box.querySelector("svg.exanim");
      ui._detailSvg = svg;
      if(svg){ try{ svg.unpauseAnimations(); }catch(err){} }
    }
  }

  /* ================= MODALI ================= */
  function openModal(html){
    $("#modalCard").innerHTML = html;
    $("#modalRoot").classList.remove("hidden");
  }
  function closeModal(){ $("#modalRoot").classList.add("hidden"); }

  function newRoutineModal(){
    openModal(`
      <div class="modal-head"><span class="modal-title">Nuova scheda</span>${iconBtn("x","Chiudi","",`onclick="App.closeModal()"`)}</div>
      <div class="field"><label>Nome scheda</label>
        <input id="m-rname" placeholder="Es. Day 4 Braccia 💪" maxlength="60"/></div>
      <button class="btn btn-primary" style="width:100%" onclick="App.createRoutineFromModal()">Crea scheda</button>`);
    setTimeout(()=>{const i=$("#m-rname");if(i)i.focus();},50);
  }

  function renameModal(id){
    const r = S.getRoutine(id); if(!r) return;
    openModal(`
      <div class="modal-head"><span class="modal-title">Rinomina scheda</span>${iconBtn("x","Chiudi","",`onclick="App.closeModal()"`)}</div>
      <div class="field"><label>Nuovo nome</label>
        <input id="m-rrename" value="${esc(r.name)}" maxlength="60"/></div>
      <button class="btn btn-primary" style="width:100%" data-rid="${id}" onclick="App.renameFromModal('${id}')">Salva</button>`);
    setTimeout(()=>{const i=$("#m-rrename");if(i){i.focus();i.select();}},50);
  }

  function setsModal(routineId, exUid){
    const r=S.getRoutine(routineId); const e=r&&r.exercises.find(x=>x.uid===exUid); if(!e) return;
    const rowsOf = (list)=> list.map((s,i)=>`
      <div class="row" style="margin-bottom:8px" data-setrow>
        <div class="field" style="flex:1;margin:0"><label>Serie</label><input type="number" min="1" value="${s.sets}" data-f="sets"></div>
        <div class="field" style="flex:1;margin:0"><label>Reps</label><input type="number" min="1" value="${s.reps}" data-f="reps"></div>
        <div class="field" style="flex:1;margin:0"><label>Kg</label><input type="number" min="0" step="0.5" value="${s.kg}" data-f="kg"></div>
        <button class="icon-btn danger" title="Rimuovi riga" onclick="this.closest('[data-setrow]').remove()"><svg><use href="#ic-trash"/></svg></button>
      </div>`).join("");
    openModal(`
      <div class="modal-head"><span class="modal-title">${esc(e.name)}</span>${iconBtn("x","Chiudi","",`onclick="App.closeModal()"`)}</div>
      <div class="small muted" style="margin-bottom:10px">Configura Serie × Ripetizioni × Carico (Kg).</div>
      <div id="m-sets">${rowsOf(e.sets)}</div>
      <button class="btn btn-mini" onclick="App.addSetRow()"><svg style="width:14px;height:14px"><use href="#ic-plus"/></svg>Aggiungi riga serie</button>
      <button class="btn btn-primary" style="width:100%;margin-top:14px" data-rid="${routineId}" data-uid="${exUid}" onclick="App.saveSets('${routineId}','${exUid}')">Salva</button>`);
  }

  function customExerciseModal(routineId){
    const opts = Object.entries(D.MUSCLE_GROUPS).map(([k,g])=>`<option value="${k}">${g.label}</option>`).join("");
    const demos = D.DEMOS.map(k=>`<option value="${k}">${k}</option>`).join("");
    openModal(`
      <div class="modal-head"><span class="modal-title">Esercizio personalizzato</span>${iconBtn("x","Chiudi","",`onclick="App.closeModal()"`)}</div>
      <div class="field"><label>Nome</label><input id="m-ce-name" placeholder="Es. Cable Curl" maxlength="60"/></div>
      <div class="field"><label>Gruppo muscolare</label><select id="m-ce-muscle">${opts}</select></div>
      <div class="field"><label>Animazione demo</label><select id="m-ce-demo" onchange="App.previewDemo(this.value)">${demos}</select>
        <div class="anim-box" id="m-ce-preview" style="height:130px;margin-top:6px">${D.animSvg("curl")}</div></div>
      <div class="row">
        <div class="field" style="flex:1"><label>Serie</label><input id="m-ce-sets" type="number" min="1" value="3"></div>
        <div class="field" style="flex:1"><label>Reps</label><input id="m-ce-reps" type="number" min="1" value="10"></div>
        <div class="field" style="flex:1"><label>Kg</label><input id="m-ce-kg" type="number" min="0" step="0.5" value="0"></div>
      </div>
      <button class="btn btn-primary" style="width:100%" data-rid="${routineId||''}" onclick="App.saveCustomExercise(${routineId?`'${routineId}'`:"null"})">Salva${routineId?" e aggiungi alla scheda":""}</button>`);
    setTimeout(()=>{const i=$("#m-ce-name");if(i)i.focus();},50);
  }

  function profileModal(){
    const p = S.getProfile();
    openModal(`
      <div class="modal-head"><span class="modal-title">Profilo corporeo</span>${iconBtn("x","Chiudi","",`onclick="App.closeModal()"`)}</div>
      <div class="row">
        <div class="field" style="flex:1"><label>Peso (kg)</label><input id="m-p-w" type="number" min="20" step="0.1" value="${p.weightKg}"></div>
        <div class="field" style="flex:1"><label>Altezza (cm)</label><input id="m-p-h" type="number" min="80" value="${p.heightCm}"></div>
      </div>
      <div class="row">
        <div class="field" style="flex:1"><label>Età</label><input id="m-p-a" type="number" min="10" value="${p.age}"></div>
        <div class="field" style="flex:1"><label>Sesso</label><select id="m-p-s">
          <option value="m" ${p.sex!=="f"?"selected":""}>Maschio</option>
          <option value="f" ${p.sex==="f"?"selected":""}>Femmina</option></select></div>
      </div>
      <div class="row">
        <div class="field" style="flex:1"><label>Massa muscolare (kg, opz.)</label><input id="m-p-m" type="number" min="0" step="0.1" value="${p.muscleMassKg??''}"></div>
        <div class="field" style="flex:1"><label>Grasso corporeo (%, opz.)</label><input id="m-p-f" type="number" min="0" max="70" step="0.1" value="${p.bodyFatPct??''}"></div>
      </div>
      <p class="muted small">Salvando con un peso diverso dall'ultimo, la pesata viene registrata nello storico corporeo (grafico in Dashboard).</p>
      <button class="btn btn-primary" style="width:100%;margin-top:8px" onclick="App.saveProfile()">Salva profilo</button>`);
  }

  function reportModal(rec){
    openModal(`
      <div class="modal-head"><span class="modal-title">🏁 Mini Report</span>${iconBtn("x","Chiudi","",`onclick="App.closeModal()"`)}</div>
      <div class="small muted" style="margin-bottom:12px">${esc(rec.routineName)} · ${fmtDate(rec.endTs)} ${fmtTime(rec.startTs)}–${fmtTime(rec.endTs)}</div>
      <div class="dash-grid" style="grid-template-columns:1fr 1fr">
        <div class="stat-box"><div class="stat-val"><svg style="width:18px;height:18px;display:inline;vertical-align:-3px;color:var(--accent2)"><use href="#ic-flame"/></svg> ${rec.calories}</div><div class="stat-lbl">Kcal bruciate</div></div>
        <div class="stat-box"><div class="stat-val">${fmtDur(rec.workSecs*1000)}</div><div class="stat-lbl">Tempo effettivo lavoro</div></div>
        <div class="stat-box"><div class="stat-val">${rec.completion}%</div><div class="stat-lbl">Completamento scheda</div></div>
        <div class="stat-box"><div class="stat-val">${rec.volumeKg.toLocaleString("it-IT")}</div><div class="stat-lbl">Kg totali sollevati</div></div>
      </div>
      <div class="row small muted" style="margin-top:12px;justify-content:center">
        <span>✅ ${rec.done} completati</span><span>⛔ ${rec.skipped} saltati</span><span>⏳ ${rec.pending} mancanti</span>
      </div>
      <div class="progress-track" style="margin-top:12px"><div class="progress-fill" style="width:${rec.completion}%"></div></div>
      <button class="btn btn-primary" style="width:100%;margin-top:16px" onclick="App.closeModal();App.gotoDashboard()">Vedi in Dashboard</button>`);
  }

  function manualTimesModal(){
    const s=S.getSession(); if(!s) return;
    const toLocal = ts => { const d=new Date(ts); const p=n=>String(n).padStart(2,"0");
      return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
    openModal(`
      <div class="modal-head"><span class="modal-title">Registra inizio/fine manuale</span>${iconBtn("x","Chiudi","",`onclick="App.closeModal()"`)}</div>
      <div class="field"><label>Data e ora inizio</label><input id="m-start" type="datetime-local" value="${toLocal(s.startTs)}"></div>
      <div class="field"><label>Data e ora fine</label><input id="m-end" type="datetime-local" value="${toLocal(Date.now())}"></div>
      <button class="btn btn-primary" style="width:100%" onclick="App.confirmManualEnd()">Chiudi sessione</button>`);
  }

  /* ================= TIMER TICK ================= */
  function startTicker(){
    clearInterval(ui.tick);
    ui.tick = setInterval(()=>{
      const s = S.getSession();
      if(!s){ clearInterval(ui.tick); ui.tick=null; return; }
      if(ui.view==="routines" && $("#liveClock")){
        $("#liveClock").textContent = fmtDur(Date.now()-s.startTs);
        const box=$("#restBox"), rt=$("#restTime");
        if(rt){
          if(s.restUntil && s.restUntil>Date.now()){
            const rem=Math.ceil((s.restUntil-Date.now())/1000);
            rt.textContent = fmtDur(rem*1000).replace(/^\d+:/,"").padStart(5,"0");
            box.classList.add("running");
          } else {
            if(s.restUntil && box.classList.contains("running")){ toast("💪 Recupero finito!"); S.setRest(null); }
            rt.textContent="--:--"; box.classList.remove("running");
          }
        }
      }
      updateLiveBanner();
    },1000);
  }

  function updateLiveBanner(){
    const s=S.getSession(); const b=$("#liveBanner");
    if(!b) return;
    if(s && !(ui.view==="routines" && $("#liveClock"))){
      b.classList.remove("hidden");
      $("#liveBannerTime").textContent = fmtDur(Date.now()-s.startTs);
    } else b.classList.add("hidden");
  }

  /* ================= API pubblica ================= */
  const App = {
    init(){
      S.load();
      setupDelegation();
      $("#tabs").addEventListener("click", ev=>{
        const b = ev.target.closest(".tab"); if(b) switchView(b.dataset.view);
      });
      render(); startTicker();
    },
    closeModal,
    goto(v){ switchView(v); },
    gotoLibrary(){ switchView("library"); },
    gotoDashboard(){ switchView("dashboard"); },

    /* routines */
    openRoutine(id){
      if(id && typeof id === "object" && id.getAttribute) id = id.getAttribute("data-rid") || id.dataset.rid || null;
      if(!id){ render(); return; }
      ui.openRoutineId=id; switchView("routines");
    },
    backToRoutines(){ ui.openRoutineId=null; render(); },
    newRoutine(){ newRoutineModal(); },
    createRoutineFromModal(){
      const n = $("#m-rname").value.trim();
      const r = S.createRoutine(n || "Nuova Scheda");
      closeModal(); ui.openRoutineId = r.id; render(); toast("Scheda creata 💪");
    },
    renameRoutine(id){
      if(id && typeof id === "object" && id.getAttribute) id = id.getAttribute("data-rid") || id.dataset.rid;
      renameModal(id);
    },
    renameFromModal(a, b){
      const id = (typeof b === "string") ? b : (typeof a === "string" ? a : null);
      const n = $("#m-rrename").value.trim();
      if(n) S.renameRoutine(id,n);
      closeModal(); render(); toast("Scheda rinominata ✔");
    },
    deleteRoutine(id){
      if(id && typeof id === "object" && id.getAttribute) id = id.getAttribute("data-rid") || id.dataset.rid;
      const r=S.getRoutine(id);
      if(r && confirm(`Eliminare la scheda "${r.name}"?`)){
        S.deleteRoutine(id); ui.openRoutineId=null; render(); toast("Scheda eliminata");
      }
    },
    moveEx(rid,uid_,dir){
      if(rid && typeof rid === "object" && rid.getAttribute){ dir = uid_; uid_ = rid; rid = rid.getAttribute("data-rid"); }
      if(typeof uid_ === "object" && uid_.getAttribute) uid_ = uid_.getAttribute("data-uid") || uid_.dataset.uid;
      S.moveExercise(rid,uid_,dir); render();
    },
    removeEx(rid,uid_){
      if(rid && typeof rid === "object" && rid.getAttribute){ uid_ = rid; rid = rid.getAttribute("data-rid"); }
      if(uid_ && typeof uid_ === "object" && uid_.getAttribute) uid_ = uid_.getAttribute("data-uid") || uid_.dataset.uid;
      S.removeExercise(rid,uid_); render();
    },
    editSetsModal(rid,uid_){
      if(rid && typeof rid === "object" && rid.getAttribute){ uid_ = rid; rid = rid.getAttribute("data-rid"); }
      if(uid_ && typeof uid_ === "object" && uid_.getAttribute) uid_ = uid_.getAttribute("data-uid") || uid_.dataset.uid;
      setsModal(rid,uid_);
    },
    addSetRow(){
      const div=document.createElement("div");
      div.setAttribute("data-setrow","");
      div.className="row"; div.style.marginBottom="8px";
      div.innerHTML=`<div class="field" style="flex:1;margin:0"><label>Serie</label><input type="number" min="1" value="3" data-f="sets"></div>
        <div class="field" style="flex:1;margin:0"><label>Reps</label><input type="number" min="1" value="10" data-f="reps"></div>
        <div class="field" style="flex:1;margin:0"><label>Kg</label><input type="number" min="0" step="0.5" value="0" data-f="kg"></div>
        <button class="icon-btn danger" onclick="this.closest('[data-setrow]').remove()"><svg><use href="#ic-trash"/></svg></button>`;
      $("#m-sets").appendChild(div);
    },
    saveSets(a, b){
      const strs = [a,b].filter(x=>typeof x==="string");
      const rid = strs[0], uid_ = strs[1];
      const rows=$$("#m-sets [data-setrow]");
      const sets=rows.map(row=>{
        const g=f=>parseFloat(row.querySelector(`[data-f="${f}"]`).value)||0;
        return {sets:Math.max(1,g("sets")), reps:Math.max(1,g("reps")), kg:Math.max(0,g("kg"))};
      });
      S.updateExercise(rid,uid_,{sets});
      closeModal(); render(); toast("Serie aggiornate ✔");
    },

    /* libreria */
    filterLib(k){ ui.libFilter=k; render(); },
    searchLib(q){
      ui.libSearch=q;
      render();
      // mantiene focus e posizione cursore nel campo di ricerca
      const inp=$("#libSearch");
      if(inp){ inp.focus(); inp.setSelectionRange(q.length,q.length); }
    },
    previewDemo(k){
      const box=$("#m-ce-preview");
      if(box) box.innerHTML = D.animSvg(k);
    },
    quickAdd(libId){
      if(libId && typeof libId === "object" && libId.getAttribute) libId = libId.getAttribute("data-lid") || libId;
      const target = S.getRoutine(ui.openRoutineId);
      if(!target){ toast("Apri prima una scheda!"); return; }
      const lib = S.allLibraryExercises().find(e=>e.id===libId); if(!lib) return;
      const item = S.addExerciseToRoutine(target.id,{
        libId:lib.id, name:lib.name, muscle:lib.primary,
        sets:[{sets:3,reps:12,kg:0}], custom:!!lib.custom
      });
      toast(`➕ ${lib.name} → ${target.name}`);
      // feedback animato sulla card libreria
      const card = document.getElementById("lib-"+lib.id);
      if(card){ card.classList.remove("just-added"); void card.offsetWidth; card.classList.add("just-added"); }
      // micro-animazione sull'elemento aggiunto (bounce + glow arancio)
      ui.openRoutineId = target.id; switchView("routines");
      const el = document.getElementById("item-"+item.uid);
      if(el){ el.classList.add("added-flash"); el.scrollIntoView({behavior:"smooth",block:"center"}); }
    },
    customExerciseModal(rid){
      if(rid && typeof rid === "object" && rid.getAttribute) rid = rid.getAttribute("data-rid") || rid.dataset.rid || null;
      customExerciseModal(rid);
    },
    saveCustomExercise(a){
      const rid = (typeof a === "string") ? a : null;
      const name=$("#m-ce-name").value.trim();
      if(!name){ toast("Inserisci un nome"); return; }
      const muscle=$("#m-ce-muscle").value, demo=$("#m-ce-demo").value;
      const sets=[{sets:+$("#m-ce-sets").value||3, reps:+$("#m-ce-reps").value||10, kg:parseFloat($("#m-ce-kg").value)||0}];
      const ce = S.addCustomExercise({name,muscle,demo});
      closeModal();
      if(rid){
        const item = S.addExerciseToRoutine(rid,{libId:ce.id,name,muscle,sets,custom:true});
        ui.openRoutineId=rid; switchView("routines");
        const el=document.getElementById("item-"+item.uid);
        if(el){ el.classList.add("added-flash"); el.scrollIntoView({behavior:"smooth",block:"center"}); }
      } else render();
      toast("Esercizio personalizzato creato ✨");
    },

    /* live workout */
    startWorkout(rid){
      if(rid && typeof rid === "object" && rid.getAttribute) rid = rid.getAttribute("data-rid") || rid.dataset.rid;
      if(S.getSession()){ toast("C'è già una sessione attiva!"); this.openLive(); return; }
      const r=S.getRoutine(rid);
      if(!r || !r.exercises.length){ toast("Aggiungi esercizi alla scheda prima di iniziare"); return; }
      if(S.getSession()) return;
      S.startSession(rid);
      ui.openRoutineId=rid; switchView("routines"); startTicker();
      toast("🔥 Sessione avviata: "+fmtTime(Date.now()));
    },
    openLive(){ ui.openRoutineId = S.getSession()?.routineId || null; switchView("routines"); render(); },
    setStatus(btn,uid_,st){
      if(typeof btn==="object" && btn && btn.getAttribute){
        const real = btn.getAttribute("data-uid") || uid_;
        uid_ = real;
      } else { uid_ = btn; }
      const s=S.getSession(); if(!s) return;
      s.items[uid_] === st ? S.setItemStatus(uid_,null) : S.setItemStatus(uid_,st);
      render();
    },
    startRest(sec){
      if(sec && typeof sec === "object") sec = Number(sec.dataset && sec.dataset.sec) || 60;
      S.setRest(Date.now()+sec*1000);
      toast(`⏱️ Recupero ${sec}s avviato`);
      render();
    },
    clearRest(){ S.setRest(null); render(); },
    finishWorkout(){ manualTimesModal(); },
    manualTimes(){ manualTimesModal(); },
    confirmManualEnd(){
      const s=S.getSession(); if(!s) return;
      const sv=$("#m-start").value, ev=$("#m-end").value;
      let st = sv? new Date(sv).getTime(): s.startTs;
      let en = ev? new Date(ev).getTime(): Date.now();
      if(en<=st){ toast("L'inizio deve precedere la fine"); return; }
      const rec = S.endSession(st,en);
      closeModal(); render();
      if(rec) reportModal(rec);
    },

    /* profilo */
    profileModal(){ profileModal(); },
    saveProfile(){
      const patch = {
        weightKg: parseFloat($("#m-p-w").value)||75,
        heightCm: parseFloat($("#m-p-h").value)||175,
        age: parseInt($("#m-p-a").value)||30,
        sex: $("#m-p-s").value,
        muscleMassKg: $("#m-p-m").value!==""?parseFloat($("#m-p-m").value):null,
        bodyFatPct: $("#m-p-f").value!==""?parseFloat($("#m-p-f").value):null
      };
      S.setProfile(patch);
      closeModal(); render(); toast("Profilo salvato ✔");
    },

    /* libreria: dettagli + helper per onclick inline */
    exDetail(libId){ exDetailModal(libId); },
    detailPause(btn){ const svg = ui._detailSvg; if(svg){ try{ svg.pauseAnimations(); }catch(e){} } toast("⏸ Demo in pausa"); },
    detailPlay(btn){ const svg = ui._detailSvg; if(svg){ try{ svg.setCurrentTime(0); svg.unpauseAnimations(); }catch(e){} } toast("▶ Demo attiva"); },
    detailGhost(btn){
      const box = document.getElementById("detAnimBox"); if(!box) return;
      const ghost = box.querySelector(".ghost-frame");
      if(!ghost){
        // telaio "ghost" che evidenzia le estremità del ROM (frame alto/basso sovrapposti)
        const g = document.createElementNS("http://www.w3.org/2000/svg","g");
        g.setAttribute("class","ghost-frame");
        g.innerHTML = `<rect x="6" y="6" width="108" height="148" rx="10" fill="none" stroke="#FFB300" stroke-width="1.2" stroke-dasharray="5 4" opacity=".7"/>
          <text x="12" y="16" font-size="8" fill="#FFB300" opacity=".9">TOP ROM</text>
          <text x="12" y="152" font-size="8" fill="#FF5E00" opacity=".9">BOT ROM</text>`;
        const svg = box.querySelector("svg.exanim");
        if(svg){ svg.appendChild(g); toast("👁 Griglia ROM mostrata"); }
      } else {
        ghost.style.display = ghost.style.display === "none" ? "" : "none";
        toast(ghost.style.display === "none" ? "Griglia ROM nascosta" : "👁 Griglia ROM mostrata");
      }
    },
    escHtml(s){ const d=document.createElement("div"); d.textContent=s; return d.innerHTML; },
    setLibTarget(id){ ui.openRoutineId = id || null; render(); if(id){ const r=S.getRoutine(id); toast("🎯 Scheda attiva: "+(r?r.name:"")); } },
    toggleBodySeries(k){ ui.bodyOff = ui.bodyOff||{}; ui.bodyOff[k]=!ui.bodyOff[k]; render(); },
    barTip(title,label,value,unit){ toast(`${title?title+" · ":""}${label}: ${Number(value).toLocaleString("it-IT")} ${unit}`.trim()); },
    pieTip(label,value,unit,pct){ toast(`${label}: ${value}${unit?" "+unit:""} (${pct}%)`); },
    exportData(){
      try{
        const data = S.exportState ? S.exportState() : {history:S.getHistory(),routines:S.getRoutines(),profile:S.getProfile()};
        const blob = new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
        const a=document.createElement("a"); a.href=URL.createObjectURL(blob);
        a.download="strongworkout-dati.json"; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),3000);
        toast("📦 Dati esportati in JSON ✔");
      }catch(e){ toast("Esportazione non disponibile su questo browser"); }
    },
    sessionDetail(id){
      const h = S.getHistory().find(x=>x.id===id); if(!h) return;
      const det = (h.exDetail||[]).map(e=>`<div class="profile-row"><span>${esc(e.name)}</span><b>${Math.round(e.volume).toLocaleString("it-IT")} kg</b></div>`).join("");
      openModal(`
        <div class="modal-head"><span class="modal-title">Sessione · ${fmtDate(h.endTs)}</span>${iconBtn("x","Chiudi","",`onclick="App.closeModal()"`)}</div>
        <div class="profile-row"><span>Scheda</span><b>${esc(h.routineName)}</b></div>
        <div class="profile-row"><span>Durata</span><b>${fmtDur(h.durationMs)}</b></div>
        <div class="profile-row"><span>Esercizi</span><b>${h.done}/${h.total} completati · ${h.skipped} saltati</b></div>
        <div class="profile-row"><span>Volume totale</span><b>${h.volumeKg.toLocaleString("it-IT")} kg</b></div>
        <div class="profile-row"><span>Calorie</span><b>${h.calories} kcal 🔥</b></div>
        <div class="profile-row"><span>Completamento</span><b>${h.completion}%</b></div>
        ${det?`<div class="card-h" style="margin-top:12px">Dettaglio esercizi</div>${det}`:""}
        <button class="btn btn-primary" style="width:100%;margin-top:14px" onclick="App.closeModal()">Chiudi</button>`);
    },
    gotoRoutines(){ ui.view="routines"; render(); }
  };

  global.App = App;
  document.addEventListener("DOMContentLoaded", App.init);
})(window);
