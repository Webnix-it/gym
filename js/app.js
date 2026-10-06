/* ===== app.js — Logica UI: viste, router, modali, live workout, dashboard ===== */
(function (global) {
  "use strict";

  const D = global.SWT_DATA, S = global.SWT_STORE;
  const $  = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));

  /* ---------- utils ---------- */
  function esc(s){ return String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function fmtDate(ts){ const d=new Date(ts); return d.toLocaleDateString("it-IT",{day:"2-digit",month:"short",year:"numeric"}); }
  function fmtTime(ts){ const d=new Date(ts); return d.toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"}); }
  function fmtDur(ms){
    const s=Math.max(0,Math.floor(ms/1000));
    const h=Math.floor(s/3600), m=Math.floor(s%3600/60), ss=s%60;
    return (h?String(h).padStart(2,"0")+":":"") + String(m).padStart(2,"0")+":"+String(ss).padStart(2,"0");
  }
  function muscleLabel(k){ return D.MUSCLE_GROUPS[k] || k; }
  function toast(msg){
    const t=$("#toast"); t.textContent=msg; t.classList.add("show");
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
    tick: null
  };

  /* ================= Router / tabs ================= */
  function switchView(v){
    ui.view = v;
    $$(".tab").forEach(b => b.classList.toggle("active", b.dataset.view===v));
    $$(".view").forEach(s => s.classList.toggle("active", s.id==="view-"+v));
    render();
  }

  /* ---------- delega eventi (robusta anche dove gli handler inline non vengono eseguiti) ----------
     Gli attributi onclick restano per i browser reali; qui intercettiamo il click sul container
     #main e invochiamo App[fn](el, ...args), passando l'elemento cliccato come primo argomento.
     Le funzioni che ricevono un elemento usano data-uid / data-rid come identificatori canonici. */
  function setupDelegation(){
    const main = $("#main");
    if(!main || main._delegated) return;
    main._delegated = true;
    main.addEventListener("click", ev => {
      const el = ev.target.closest("[onclick]");
      if(!el) return;
      const m = String(el.getAttribute("onclick")).match(/App\.(\w+)\(([^)]*)\)/);
      if(!m) return;
      const fn = App[m[1]];
      if(typeof fn !== "function") return;
      const args = [];
      const re = /'([^']*)'|"([^"]*)"|(-?\d+(?:\.\d+)?)/g;
      let mm;
      while((mm = re.exec(m[2])) !== null){
        args.push(mm[1] !== undefined ? mm[1] : (mm[2] !== undefined ? mm[2] : Number(mm[3])));
      }
      // se sia la delega sia l'handler inline vengono entrambi eseguiti (browser reali),
      // evita il doppio intervento sulla stessa interazione
      if(el._swtHandled === ev.timeStamp) return;
      el._swtHandled = ev.timeStamp;
      fn.apply(App, [el].concat(args));
    });
  }

  /* ================= RENDER ================= */
  function render(){
    if(ui.view==="routines"){
      const s=S.getSession();
      $("#view-routines").innerHTML = (s && ui.openRoutineId===s.routineId) ? renderLiveHtml(s) : renderRoutines();
    }
    if(ui.view==="library")  $("#view-library").innerHTML  = renderLibrary();
    if(ui.view==="dashboard")$("#view-dashboard").innerHTML= renderDashboard();
    updateLiveBanner();
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
        return `<div class="routine-card" data-rid="${r.id}" onclick="App.openRoutine('${r.id}')">
          <div class="routine-name">${esc(r.name)}</div>
          <div class="muted small">${r.exercises.length} esercizi</div>
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
    let html = `
      <div class="row" style="margin-top:18px">
        <button class="btn btn-mini" onclick="App.backToRoutines()">← Indietro</button>
        <span class="spacer"></span>
        <button class="btn btn-mini" data-rid="${r.id}" onclick="App.renameRoutine('${r.id}')"><svg style="width:14px;height:14px"><use href="#ic-pencil"/></svg>Rinomina</button>
        <button class="btn btn-mini btn-primary" data-rid="${r.id}" onclick="App.startWorkout('${r.id}')"><svg style="width:14px;height:14px"><use href="#ic-play"/></svg>Avvia allenamento</button>
      </div>
      <h2 class="section-title" style="margin-top:14px"><svg><use href="#ic-dumbbell"/></svg>${esc(r.name)}</h2>`;

    if(!r.exercises.length){
      html += `<div class="empty-state card"><svg><use href="#ic-dumbbell"/></svg>
        <p>Scheda vuota. Aggiungi esercizi dalla <b>Libreria</b> o creane uno personalizzato.</p>
        <div class="row" style="justify-content:center;margin-top:12px">
          <button class="btn btn-primary" onclick="App.gotoLibrary()"><svg><use href="#ic-library"/></svg>Vai alla libreria</button>
          <button class="btn" data-rid="${r.id}" onclick="App.customExerciseModal('${r.id}')"><svg><use href="#ic-plus"/></svg>Esercizio personalizzato</button>
        </div></div>`;
      return html;
    }

    html += r.exercises.map((e,i)=>{
      const pills = e.sets.map(s=>`<span class="set-pill">${s.sets}×${s.reps}${s.kg?` @ ${s.kg}kg`:""}</span>`).join("");
      return `<div class="ex-item" id="item-${e.uid}">
        <div class="ex-info">
          <div class="ex-name">${esc(e.name)} ${e.custom?'<span class="chip" style="font-size:.65rem">custom</span>':""}</div>
          <div class="ex-sub">${muscleLabel(e.muscle)} · ${pills}</div>
        </div>
        <div class="row" style="gap:4px">
          <button class="btn btn-mini" data-rid="${r.id}" data-uid="${e.uid}" onclick="App.editSetsModal('${r.id}','${e.uid}')">Set/Reps/Kg</button>
          ${iconBtn("up","Sposta su","",`data-rid="${r.id}" data-uid="${e.uid}" onclick="App.moveEx('${r.id}','${e.uid}',-1)"`)}
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
    const chips = [`<button class="filter-chip ${ui.libFilter==="all"?"active":""}" onclick="App.filterLib('all')">Tutti</button>`]
      .concat(Object.entries(groups).map(([k,l])=>
        `<button class="filter-chip ${ui.libFilter===k?"active":""}" onclick="App.filterLib('${k}')">${l}</button>`)).join("");

    const list = S.allLibraryExercises().filter(e => ui.libFilter==="all" || e.primary===ui.libFilter);
    const active = S.getRoutine(ui.openRoutineId);
    const targetInfo = active ? `alla scheda attiva <b>${esc(active.name)}</b>` : "";

    let html = `
      <div class="row" style="justify-content:space-between;margin-top:18px">
        <h2 class="section-title" style="margin:0"><svg><use href="#ic-library"/></svg>Libreria Esercizi</h2>
        <button class="btn btn-mini" onclick="App.customExerciseModal(null)"><svg><use href="#ic-plus"/></svg>Nuovo esercizio personalizzato</button>
      </div>
      <p class="muted small" style="margin-top:8px">Filtra per gruppo muscolare e usa <b>Aggiungi</b> per inserirlo ${targetInfo || "in una scheda"}.
      ${!active ? '<span style="color:var(--accent)">Apri una scheda per abilitare l\'aggiunta rapida.</span>' : ""}</p>
      <div class="filter-bar">${chips}</div>
      <div class="lib-grid">` + list.map(e=>`
        <div class="lib-card" id="lib-${e.id}">
          <div class="anim-box">${D.DEMOS[e.demo] || D.DEMOS.curl}</div>
          <div>
            <div class="ex-name" style="font-size:.92rem">${esc(e.name)}</div>
            <div class="small muted" style="margin-top:3px">Primario: <b style="color:var(--accent)">${muscleLabel(e.primary)}</b>
              ${e.secondary?`· Secondario: ${muscleLabel(e.secondary)}`:""}</div>
          </div>
          <button class="btn btn-mini btn-primary" data-lid="${e.id}" ${active?`onclick="App.quickAdd('${e.id}')"`:`disabled style="opacity:.4;cursor:not-allowed"`}>
            <svg style="width:14px;height:14px"><use href="#ic-plus"/></svg>Aggiungi a ${active?esc(active.name):"scheda"}
          </button>
        </div>`).join("") + `</div>`;
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
        <button class="btn btn-mini btn-danger" onclick="App.finishWorkout()"><svg style="width:14px;height:14px"><use href="#ic-stop"/></svg>Termina sessione</button>
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
        <span class="muted small">Recuper:</span>
        <span class="rest-time" id="restTime">--:--</span>
        <span class="spacer"></span>
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
        return `<div class="live-ex ${st||""}" id="lv-${e.uid}">
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
  const PIE_COLORS = ["#FFB300","#FF5E00","#FFD54F","#FF8A50","#FFC107","#E65100","#FFE082","#FF7043"];

  function pieSvg(data){
    // data: [{label,value}] -> donut con stroke-dasharray
    const total = data.reduce((s,d)=>s+d.value,0) || 1;
    const R=42, C=2*Math.PI*R;
    let offset=0, segs="";
    data.forEach((d,i)=>{
      const frac=d.value/total;
      segs += `<circle class="seg" cx="60" cy="60" r="${R}" fill="none" stroke="${PIE_COLORS[i%PIE_COLORS.length]}"
        stroke-width="22" stroke-dasharray="${(frac*C-1.5).toFixed(2)} ${(C-frac*C+1.5).toFixed(2)}"
        stroke-dashoffset="${(-offset*C).toFixed(2)}" transform="rotate(-90 60 60)">
        <title>${esc(d.label)}: ${Math.round(frac*100)}%</title></circle>`;
      offset+=frac;
    });
    return `<svg class="pie" viewBox="0 0 120 120" style="width:170px;height:170px">
      <circle cx="60" cy="60" r="42" fill="none" stroke="#262626" stroke-width="22"/>${segs}
      <text x="60" y="64" text-anchor="middle" fill="#EDEDED" font-size="13" font-weight="800">${total>1e9?"":total}</text></svg>`;
  }

  function renderDashboard(){
    const hist = S.getHistory();
    const mix = S.muscleDistribution();
    const mixData = Object.entries(mix).map(([k,v])=>({label:muscleLabel(k),value:v}));
    const totDone = hist.reduce((s,h)=>s+h.done,0), totSkip = hist.reduce((s,h)=>s+h.skipped,0),
          totPend = hist.reduce((s,h)=>s+h.pending,0);
    const statusData = [
      {label:"Completati", value:totDone},
      {label:"Saltati",    value:totSkip},
      {label:"Mancanti",   value:totPend}
    ].filter(d=>d.value>0);
    const legend = arr => arr.map((d,i)=>{
      const t = arr.reduce((s,x)=>s+x.value,0)||1;
      return `<div class="legend-item"><span class="legend-dot" style="background:${PIE_COLORS[i%PIE_COLORS.length]}"></span>
        ${esc(d.label)} · <b>${Math.round(d.value/t*100)}%</b></div>`;}).join("");

    const totCal = hist.reduce((s,h)=>s+h.calories,0);
    const totMs  = hist.reduce((s,h)=>s+h.durationMs,0);
    const avgComp= hist.length? Math.round(hist.reduce((s,h)=>s+h.completion,0)/hist.length):0;

    let html = `
      <h2 class="section-title" style="margin-top:18px"><svg><use href="#ic-chart"/></svg>Dashboard Analitica</h2>
      <div class="dash-grid">
        <div class="card">
          <div class="small muted" style="margin-bottom:8px;font-weight:700;text-transform:uppercase;letter-spacing:.6px">Distribuzione gruppi muscolari</div>
          ${mixData.length? `<div class="pie-wrap">${pieSvg(mixData)}<div class="pie-legend">${legend(mixData)}</div></div>`
                          : `<p class="muted small">Nessun dato: completa almeno una sessione.</p>`}
        </div>
        <div class="card">
          <div class="small muted" style="margin-bottom:8px;font-weight:700;text-transform:uppercase;letter-spacing:.6px">Esercizi completati vs saltati</div>
          ${statusData.length? `<div class="pie-wrap">${pieSvg(statusData)}<div class="pie-legend">${legend(statusData)}</div></div>`
                             : `<p class="muted small">Nessuna sessione registrata.</p>`}
        </div>
        <div class="card" style="display:flex;flex-direction:column;justify-content:center;gap:10px">
          <div class="row" style="justify-content:space-between"><span class="muted small">Sessioni totali</span><b>${hist.length}</b></div>
          <div class="row" style="justify-content:space-between"><span class="muted small">Kcal bruciate (tot.)</span><b style="color:var(--accent)">${totCal}</b></div>
          <div class="row" style="justify-content:space-between"><span class="muted small">Tempo totale</span><b>${fmtDur(totMs)}</b></div>
          <div class="row" style="justify-content:space-between"><span class="muted small">Completamento medio</span><b>${avgComp}%</b></div>
        </div>
      </div>
      <h3 class="section-title"><svg><use href="#ic-check"/></svg>Storico sessioni</h3>`;

    if(!hist.length){
      html += `<div class="empty-state card"><svg><use href="#ic-timer"/></svg><p>Nessuna sessione completata.</p></div>`;
    } else {
      html += hist.slice(0,20).map(h=>`
        <div class="history-item">
          <div style="min-width:90px"><div class="hist-date">${fmtDate(h.endTs)}</div><div class="small muted">${fmtTime(h.startTs)}–${fmtTime(h.endTs)}</div></div>
          <div class="ex-info" style="flex:1">
            <div class="ex-name">${esc(h.routineName)}</div>
            <div class="ex-sub">${h.done}/${h.total} esercizi · ${h.skipped} saltati · ${fmtDur(h.durationMs)} · ${h.volumeKg.toLocaleString("it-IT")} kg</div>
          </div>
          <span class="chip chip-accent"><svg style="width:14px;height:14px"><use href="#ic-flame"/></svg>${h.calories} kcal</span>
          <span class="chip">${h.completion}%</span>
        </div>`).join("");
    }
    return html;
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
    setTimeout(()=>$("#m-rname").focus(),50);
  }

  function renameModal(id){
    const r = S.getRoutine(id); if(!r) return;
    openModal(`
      <div class="modal-head"><span class="modal-title">Rinomina scheda</span>${iconBtn("x","Chiudi","",`onclick="App.closeModal()"`)}</div>
      <div class="field"><label>Nuovo nome</label>
        <input id="m-rrename" value="${esc(r.name)}" maxlength="60"/></div>
      <button class="btn btn-primary" style="width:100%" data-rid="${id}" onclick="App.renameFromModal('${id}')">Salva</button>`);
    setTimeout(()=>{const i=$("#m-rrename");i.focus();i.select();},50);
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
    const opts = Object.entries(D.MUSCLE_GROUPS).map(([k,l])=>`<option value="${k}">${l}</option>`).join("");
    const demos = Object.keys(D.DEMOS).map(k=>`<option value="${k}">${k}</option>`).join("");
    openModal(`
      <div class="modal-head"><span class="modal-title">Esercizio personalizzato</span>${iconBtn("x","Chiudi","",`onclick="App.closeModal()"`)}</div>
      <div class="field"><label>Nome</label><input id="m-ce-name" placeholder="Es. Cable Curl" maxlength="60"/></div>
      <div class="field"><label>Gruppo muscolare</label><select id="m-ce-muscle">${opts}</select></div>
      <div class="field"><label>Animazione demo</label><select id="m-ce-demo">${demos}</select></div>
      <div class="row">
        <div class="field" style="flex:1"><label>Serie</label><input id="m-ce-sets" type="number" min="1" value="3"></div>
        <div class="field" style="flex:1"><label>Reps</label><input id="m-ce-reps" type="number" min="1" value="10"></div>
        <div class="field" style="flex:1"><label>Kg</label><input id="m-ce-kg" type="number" min="0" step="0.5" value="0"></div>
      </div>
      <button class="btn btn-primary" style="width:100%" data-rid="${routineId||''}" onclick="App.saveCustomExercise(${routineId?`'${routineId}'`:"null"})">Salva${routineId?" e aggiungi alla scheda":""}</button>`);
    setTimeout(()=>$("#m-ce-name").focus(),50);
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
      if(!s) return;
      if(ui.view==="routines" && $("#liveClock")){
        $("#liveClock").textContent = fmtDur(Date.now()-s.startTs);
        // rest timer
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
      // se chiamato da delega, il primo argomento è la card cliccata: usa data-rid corrente
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
    renameFromModal(id){
      if(id && typeof id === "object" && id.getAttribute) id = id.getAttribute("data-rid") || id.dataset.rid;
      const n = $("#m-rrename").value.trim();
      if(n) S.renameRoutine(id,n);
      closeModal(); render(); toast(" rinominata ✔");
    },
    deleteRoutine(id){
      if(id && typeof id === "object" && id.getAttribute) id = id.getAttribute("data-rid") || id.dataset.rid;
      const r=S.getRoutine(id);
      if(r && confirm(`Eliminare la scheda "${r.name}"?`)){
        S.deleteRoutine(id); ui.openRoutineId=null; render(); toast("Scheda eliminata");
      }
    },
    moveEx(rid,uid_,dir){
      // firma via delega: (el, uid, dir) — rid recuperata dall'attributo data-rid
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
    saveSets(rid,uid_){
      if(rid && typeof rid === "object" && rid.getAttribute){ uid_ = rid.getAttribute("data-uid") || uid_; rid = rid.getAttribute("data-rid"); }
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
      // micro-animazione: evidenzia nella lista se visuale
      render();
      const el = document.getElementById("item-"+item.uid);
      if(el){ el.classList.add("added-flash"); el.scrollIntoView({behavior:"smooth",block:"center"}); }
    },
    customExerciseModal(rid){
      if(rid && typeof rid === "object" && rid.getAttribute) rid = rid.getAttribute("data-rid") || rid.dataset.rid || null;
      customExerciseModal(rid);
    },
    saveCustomExercise(rid){
      if(rid && typeof rid === "object" && rid.getAttribute) rid = rid.getAttribute("data-rid") || rid.dataset.rid || null;
      const name=$("#m-ce-name").value.trim();
      if(!name){ toast("Inserisci un nome"); return; }
      const muscle=$("#m-ce-muscle").value, demo=$("#m-ce-demo").value;
      const sets=[{sets:+$("#m-ce-sets").value||3, reps:+$("#m-ce-reps").value||10, kg:parseFloat($("#m-ce-kg").value)||0}];
      const ce = S.addCustomExercise({name,muscle,demo});
      closeModal();
      if(rid){
        S.addExerciseToRoutine(rid,{libId:ce.id,name,muscle,sets,custom:true});
        ui.openRoutineId=rid; switchView("routines");
        setTimeout(()=>{ const el=document.getElementById("item-"+S.getRoutine(rid).exercises.slice(-1)[0].uid);
          if(el) el.classList.add("added-flash"); },50);
      } else render();
      toast("Esercizio personalizzato creato ✨");
    },

    /* live workout */
    startWorkout(rid){
      if(rid && typeof rid === "object" && rid.getAttribute) rid = rid.getAttribute("data-rid") || rid.dataset.rid;
      if(S.getSession()){ toast("C'è già una sessione attiva!"); this.openLive(); return; }
      const r=S.getRoutine(rid);
      if(!r || !r.exercises.length){ toast("Aggiungi esercizi alla scheda prima di iniziare"); return; }
      S.startSession(rid);
      ui.openRoutineId=rid; switchView("routines"); render();
      toast("🔥 Sessione avviata: "+fmtTime(Date.now()));
    },
    openLive(){ ui.openRoutineId = S.getSession()?.routineId || null; switchView("routines"); render(); },
    setStatus(btn,uid_,st){
      // il primo argomento puo' essere l'elemento cliccato (con dual binding jsdom) oppure l'uid (navigazione diretta)
      if(typeof btn==="object" && btn && btn.getAttribute){
        const real = btn.getAttribute("data-uid") || uid_;
        uid_ = real;
      } else { uid_ = btn; }
      const s=S.getSession(); if(!s) return;
      s.items[uid_] === st ? S.setItemStatus(uid_,null) : S.setItemStatus(uid_,st);
      render();
    },
    startRest(sec){
      S.setRest(Date.now()+sec*1000);
      toast(`⏱️ Recupero ${sec}s avviato`);
      render();
    },
    clearRest(){ S.setRest(null); render(); },
    finishWorkout(){ manualTimesModal(); },
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

    /* export/import helper (debug) */
    resetAll(){ if(confirm("Ripristinare dati di default? Tutto andrà perso.")){ localStorage.removeItem("swt_state_v1"); location.reload(); } }
  };

  global.App = App;
  document.addEventListener("DOMContentLoaded", App.init);
})(window);
