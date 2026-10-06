/* ===== store.js — Persistenza LocalStorage, stato live sessioni, storico, profilo, calorie ===== */
(function (global) {
  "use strict";

  const KEY = "swt_state_v2";
  const KEY_V1 = "swt_state_v1";

  function uid(p){ return (p||"id") + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
  function clone(o){ return JSON.parse(JSON.stringify(o)); }

  let state = null;

  function ensureUids(){
    let fixed = false;
    state.routines.forEach(r => {
      (r.exercises||[]).forEach(e => { if(!e.uid){ e.uid = uid("ex"); fixed = true; } });
    });
    if(fixed) save();
  }

  function defaultState(){
    const hist = (global.SWT_DATA.buildDemoHistory ? global.SWT_DATA.buildDemoHistory() : [])
      .sort((a,b) => b.endTs - a.endTs);   // dal più recente al più vecchio
    // pesata corporea demo coerente con lo storico (leggera ricomposizione: giù grasso, su muscoli)
    const DAY = 86400000;
    const bodyLog = [];
    const wSeries = [79.2,78.8,78.5,78.1,77.9,77.6,77.4,77.2];
    const mSeries = [33.2,33.4,33.6,33.9,34.1,34.3,34.5,34.7];
    const fSeries = [22.8,22.3,21.8,21.2,20.7,20.2,19.8,19.4];
    for(let i=0;i<wSeries.length;i++){
      bodyLog.push({ ts: Date.now() - (60 - i*8)*DAY, weightKg: wSeries[i], muscleKg: mSeries[i], fatPct: fSeries[i] });
    }
    return {
      routines: clone(global.SWT_DATA.DEFAULT_ROUTINES).map(r => ({...r, createdAt: Date.now(),
        exercises: (r.exercises||[]).map(e => ({...e, uid: uid("ex")})) })),
      customExercises: [],
      activeSession: null,
      history: hist,
      profile: { weightKg: 77.2, heightCm: 178, age: 29, sex: "m", muscleMassKg: 34.7, bodyFatPct: 19.4 },
      bodyLog   // [{ts, weightKg, muscleKg?, fatPct?}]
    };
  }

  /* migrazione da v1 (se presente) */
  function migrate(){
    try{
      const old = localStorage.getItem(KEY_V1);
      if(old && !localStorage.getItem(KEY)){
        const parsed = JSON.parse(old);
        const st = Object.assign(defaultState(), parsed);
        state = st; save(); return true;
      }
    }catch(e){}
    return false;
  }

  function load(){
    try{
      if(migrate()) { ensureUids(); return; }
      const raw = localStorage.getItem(KEY);
      if(raw){
        const parsed = JSON.parse(raw);
        state = Object.assign(defaultState(), parsed);
        state.profile = Object.assign(defaultState().profile, parsed.profile || {});
        if(!Array.isArray(state.routines) || (!state.routines.length && !(parsed.routines||[]).length)){
          state.routines = defaultState().routines;
        }
        ensureUids();
        return;
      }
    }catch(e){ console.warn("LocalStorage non disponibile/corrotto:", e); }
    state = defaultState();
    save();
  }

  function save(){
    try{ localStorage.setItem(KEY, JSON.stringify(state)); }
    catch(e){ console.warn("Salvataggio fallito:", e); }
  }

  /* ---- Profilo corporeo ---- */
  function getProfile(){ return state.profile; }
  function setProfile(patch){
    state.profile = Object.assign(state.profile, patch);
    // registra nel body log se presente peso
    if(patch.weightKg){
      const last = state.bodyLog[0];
      // registra la pesata solo se è cambiata rispetto all'ultima (evita duplicati)
      if(!last || Math.abs((last.weightKg||0) - (+patch.weightKg)) > 0.001){
        state.bodyLog.unshift({ ts: Date.now(), weightKg: +patch.weightKg,
          muscleKg: patch.muscleMassKg != null ? +patch.muscleMassKg : null,
          fatPct: patch.bodyFatPct != null ? +patch.bodyFatPct : null });
        state.bodyLog = state.bodyLog.slice(0, 200);
      } else {
        // stesso peso ma nuovi dati corporei: aggiorna l'ultimo record (massa/grasso)
        if(patch.muscleMassKg != null) last.muscleKg = +patch.muscleMassKg;
        if(patch.bodyFatPct != null)   last.fatPct = +patch.bodyFatPct;
      }
    }
    save();
  }
  function getBodyLog(){ return state.bodyLog; }

  /* serie temporali per i grafici corpo: peso, massa muscolare, grasso % */
  function bodySeries(key){
    const log = state.bodyLog.slice().sort((a,b)=>a.ts-b.ts);
    let series = log.map(b => ({ label: new Date(b.ts).toLocaleDateString("it-IT",{day:"2-digit",month:"2-digit"}), value: b[key] }))
                    .filter(p => p.value != null && !isNaN(p.value));
    // fallback: ricostruisce la serie dalle stime sul profilo (formula Boer)
    if(!series.length || key !== "weightKg"){
      const p = state.profile, h = (p.heightCm||175)/100;
      const leanAt = w => { let l; if(p.sex==="f") l = 0.733*w + 0.469*p.heightCm - 0.096*p.age - 24.6;
                            else l = 0.407*w + 0.267*p.heightCm - 0.158*p.age - 5.5; return Math.round(l*10)/10; };
      if(key === "muscleKg" && (!series.length)){
        series = log.map(b => ({ label: new Date(b.ts).toLocaleDateString("it-IT",{day:"2-digit",month:"2-digit"}), value: b.muscleKg ?? leanAt(b.weightKg) }));
      }
      if(key === "fatPct"){
        const pf = log.filter(b=>b.fatPct!=null).map(b=>({label:new Date(b.ts).toLocaleDateString("it-IT",{day:"2-digit",month:"2-digit"}),value:b.fatPct}));
        if(pf.length>=2) return pf;
        series = log.map(b => { const lean = b.muscleKg ?? leanAt(b.weightKg);
          const fat = Math.max(0, b.weightKg - lean);
          return { label: new Date(b.ts).toLocaleDateString("it-IT",{day:"2-digit",month:"2-digit"}), value: Math.round(fat/b.weightKg*1000)/10 }; });
      }
    }
    return series;
  }

  // BMI + stima massa magra di riferimento (formula Boer semplificata)
  function bodyStats(){
    const p = state.profile;
    const h = (p.heightCm||175)/100;
    const bmi = +((p.weightKg||75)/(h*h)).toFixed(1);
    let lean;
    if(p.sex === "f") lean = 0.733*p.weightKg + 0.469*p.heightCm - 0.096*p.age - 24.6;
    else lean = 0.407*p.weightKg + 0.267*p.heightCm - 0.158*p.age - 5.5;
    lean = Math.max(30, Math.round(lean*10)/10);
    let fat = Math.max(0, Math.round((p.weightKg - lean)*10)/10);
    let bfp = Math.round(fat/(p.weightKg||75)*1000)/10;
    let muscle = p.muscleMassKg || null;
    if(p.bodyFatPct != null && p.bodyFatPct !== ""){
      bfp = +p.bodyFatPct;
      fat = Math.round(p.weightKg*bfp)/100;
    }
    // variazioni rispetto alla pesata precedente nello storico
    const log = state.bodyLog.slice().sort((a,b)=>a.ts-b.ts);
    const delta = {};
    if(log.length >= 2){
      const f = log[0], l = log[log.length-1];
      delta.weight = Math.round((l.weightKg - f.weightKg)*10)/10;
      if(l.muscleKg != null && f.muscleKg != null) delta.muscle = Math.round((l.muscleKg - f.muscleKg)*10)/10;
      if(l.fatPct != null && f.fatPct != null) delta.fat = Math.round((l.fatPct - f.fatPct)*10)/10;
    }
    return { bmi, leanKg: muscle || lean, fatKg: fat, bodyFatPct: bfp, delta };
  }

  /* ---- Routine CRUD ---- */
  function getRoutines(){ return state.routines; }
  function getRoutine(id){ return state.routines.find(r => r.id === id); }
  function createRoutine(name){
    const r = { id: uid("rt"), name: name || "Nuova Scheda", exercises: [], createdAt: Date.now() };
    state.routines.push(r); save(); return r;
  }
  function renameRoutine(id, name){
    const r = getRoutine(id); if(r){ r.name = name; save(); } return r;
  }
  function deleteRoutine(id){
    state.routines = state.routines.filter(r => r.id !== id);
    if(state.activeSession && state.activeSession.routineId === id) state.activeSession = null;
    save();
  }

  /* ---- Esercizi nelle schede ---- */
  function addExerciseToRoutine(routineId, ex){
    const r = getRoutine(routineId); if(!r) return null;
    const item = { uid: uid("ex"), libId: ex.libId||null, name: ex.name, muscle: ex.muscle,
                   sets: clone(ex.sets || [{sets:3,reps:10,kg:0}]), custom: !!ex.custom };
    r.exercises.push(item); save();
    return item;
  }
  function removeExercise(routineId, exUid){
    const r = getRoutine(routineId); if(!r) return;
    r.exercises = r.exercises.filter(e => e.uid !== exUid); save();
  }
  function updateExercise(routineId, exUid, patch){
    const r = getRoutine(routineId); if(!r) return null;
    const e = r.exercises.find(x => x.uid === exUid);
    if(e){ Object.assign(e, patch); save(); }
    return e;
  }
  function moveExercise(routineId, exUid, dir){
    const r = getRoutine(routineId); if(!r) return;
    const i = r.exercises.findIndex(e => e.uid === exUid);
    const j = i + dir;
    if(i < 0 || j < 0 || j >= r.exercises.length) return;
    [r.exercises[i], r.exercises[j]] = [r.exercises[j], r.exercises[i]];
    save();
  }

  /* ---- Esercizi personalizzati ---- */
  function addCustomExercise(ex){
    const item = { id: uid("ce"), name: ex.name, primary: ex.muscle, secondary: null, demo: ex.demo || "curl", custom: true };
    state.customExercises.push(item); save(); return item;
  }
  function allLibraryExercises(){
    return global.SWT_DATA.EXERCISE_LIBRARY.concat(state.customExercises);
  }

  /* ---- Sessione live ---- */
  function startSession(routineId){
    const r = getRoutine(routineId); if(!r) return null;
    state.activeSession = {
      id: uid("ss"), routineId, routineName: r.name,
      startTs: Date.now(), endTs: null,
      items: {}, restUntil: null
    };
    save(); return state.activeSession;
  }
  function getSession(){ return state.activeSession; }
  function setItemStatus(exUid, status){
    const s = state.activeSession; if(!s) return;
    if(status === null) delete s.items[exUid]; else s.items[exUid] = status;
    save();
  }
  function setRest(untilTs){
    const s = state.activeSession; if(!s) return;
    s.restUntil = untilTs; save();
  }
  function endSession(manualStartTs, manualEndTs){
    const s = state.activeSession; if(!s) return null;
    const startTs = manualStartTs || s.startTs;
    const endTs   = manualEndTs || Date.now();
    const record = finishSessionRecord(s, startTs, endTs);
    state.history.unshift(record);
    state.activeSession = null;
    save();
    return record;
  }

  /* ---- Volume & calorie (usa peso corporeo del profilo) ---- */
  function exerciseVolume(ex){
    return (ex.sets||[]).reduce((v,s) => v + (s.sets*s.reps*(s.kg||0)), 0);
  }
  function exerciseWorkSecs(ex){
    const reps = (ex.sets||[]).reduce((n,s) => n + s.sets*s.reps, 0);
    const nSets = (ex.sets||[]).reduce((n,s) => n + s.sets, 0);
    return Math.max(20, reps*6 + nSets*2);
  }
  /*
   * kcal = MET × 3.5 × peso(kg) / 200 × minuti_lavoro × intensità
   *        + volume(kg) × 0.0045
   */
  function estimateCalories(ex, bodyKg){
    const meta = global.SWT_DATA.MUSCLE_META[ex.muscle] || global.SWT_DATA.MUSCLE_META.custom;
    const w = bodyKg || state.profile.weightKg || 75;
    const mins = exerciseWorkSecs(ex)/60;
    const base = meta.met * 3.5 * w / 200 * mins * meta.intensity;
    const vol = exerciseVolume(ex) * 0.0045;
    return Math.round((base + vol) * 10) / 10;
  }

  function finishSessionRecord(s, startTs, endTs){
    const r = getRoutine(s.routineId);
    const exs = r ? r.exercises : [];
    const doneIds = Object.keys(s.items).filter(k => s.items[k] === "done");
    const skipIds = Object.keys(s.items).filter(k => s.items[k] === "skip");
    let cal = 0, vol = 0, workSecs = 0;
    const muscleMix = {};
    let exDetail = [];
    exs.forEach(e => {
      const st = s.items[e.uid];
      if(st === "done"){
        cal += estimateCalories(e);
        vol += exerciseVolume(e);
        workSecs += exerciseWorkSecs(e);
        muscleMix[e.muscle] = (muscleMix[e.muscle]||0) + 1;
        (exDetail = exDetail || []).push({ name: e.name, volume: Math.round(exerciseVolume(e)), kcal: Math.round(estimateCalories(e)) });
      }
    });
    const elapsedMin = Math.max(1,(endTs-startTs)/60000);
    const ambient = Math.round(elapsedMin * 1.1);
    return {
      id: s.id, routineId: s.routineId, routineName: s.routineName,
      startTs, endTs, durationMs: endTs - startTs, workSecs,
      calories: Math.round(cal) + ambient,
      volumeKg: Math.round(vol),
      total: exs.length,
      done: doneIds.length, skipped: skipIds.length,
      pending: exs.length - doneIds.length - skipIds.length,
      completion: exs.length ? Math.round(doneIds.length/exs.length*100) : 0,
      muscleMix, exDetail
    };
  }

  /* ---- Storico / analytics ---- */
  function getHistory(){ return state.history; }
  function muscleDistribution(){
    const mix = {};
    state.history.forEach(h => {
      Object.entries(h.muscleMix||{}).forEach(([m,n]) => mix[m] = (mix[m]||0)+n);
    });
    return mix;
  }
  // aggregati settimanali per il grafico a barre (ultime 8 settimane)
  function weeklyAggregates(){
    const weeks = [];
    const now = new Date(); now.setHours(23,59,59,999);
    for(let i = 7; i >= 0; i--){
      const end = new Date(now); end.setDate(end.getDate() - i*7);
      const start = new Date(end); start.setDate(start.getDate() - 6); start.setHours(0,0,0,0);
      const inRange = state.history.filter(h => h.endTs >= start.getTime() && h.endTs <= end.getTime());
      weeks.push({
        label: start.toLocaleDateString("it-IT",{day:"2-digit",month:"2-digit"}),
        sessions: inRange.length,
        kcal: inRange.reduce((s,h)=>s+h.calories,0),
        volume: inRange.reduce((s,h)=>s+h.volumeKg,0),
        minutes: Math.round(inRange.reduce((s,h)=>s+h.durationMs,0)/60000)
      });
    }
    return weeks;
  }

  global.SWT_STORE = {
    load, save, uid,
    getRoutines, getRoutine, createRoutine, renameRoutine, deleteRoutine,
    addExerciseToRoutine, removeExercise, updateExercise, moveExercise,
    addCustomExercise, allLibraryExercises,
    startSession, getSession, setItemStatus, setRest, endSession,
    exerciseVolume, exerciseWorkSecs, estimateCalories, getHistory, muscleDistribution, weeklyAggregates,
    getProfile, setProfile, getBodyLog, bodyStats, bodySeries,
    exportState: () => ({ exportedAt: Date.now(), routines: state.routines, customExercises: state.customExercises, history: state.history, profile: state.profile, bodyLog: state.bodyLog })
  };
})(window);
