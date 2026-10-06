/* ===== store.js — Persistenza LocalStorage, stato live sessioni, storico, calorie ===== */
(function (global) {
  "use strict";

  const KEY = "swt_state_v1";

  /* ---- helpers ---- */
  function uid(p){ return (p||"id") + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
  function clone(o){ return JSON.parse(JSON.stringify(o)); }

  /* ---- Stato ---- */
  let state = null;

  /* assicura uid univoco a ogni esercizio di una scheda (autoriparazione allo startup) */
  function ensureUids(){
    let fixed=false;
    state.routines.forEach(r=>{
      (r.exercises||[]).forEach(e=>{ if(!e.uid){ e.uid = uid("ex"); fixed=true; } });
    });
    if(fixed) save();
  }

  function defaultState(){
    return {
      routines: clone(global.SWT_DATA.DEFAULT_ROUTINES).map(r => ({...r, id: r.id, createdAt: Date.now(),
        exercises: (r.exercises||[]).map(e => ({...e, uid: uid("ex")})) })),
      customExercises: [],          // esercizi personalizzati creati dall'utente
      activeSession: null,          // sessione live in corso {id, routineId, startTs, items:{uid:'done'|'skip'}, manualEndTs?}
      history: []                   // sessioni completate
    };
  }

  function load(){
    try{
      const raw = localStorage.getItem(KEY);
      if(raw){
        const parsed = JSON.parse(raw);
        // ripristino automatico dello stato (merge difensivo con i default)
        state = Object.assign(defaultState(), parsed);
        if(!Array.isArray(state.routines) || (!state.routines.length && !parsed.routines?.length)){
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

  /* ---- Esercizi all'interno delle schede ---- */
  // struttura esercizio in scheda: {uid, libId?, name, muscle, sets:[{sets,reps,kg}], custom?}
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
      items: {},            // exUid -> 'done' | 'skip'
      restUntil: null       // ts fine recupero corrente
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

  /* ---- Calcolo volume & calorie ---- */
  // Volume sollevato di un esercizio = Σ(sets × reps × kg)
  function exerciseVolume(ex){
    return (ex.sets||[]).reduce((v,s) => v + (s.sets*s.reps*(s.kg||0)), 0);
  }
  // Stima durata lavoro per esercizio (secondi): ~6s/rep + 2s cambio set, min 20s
  function exerciseWorkSecs(ex){
    const reps = (ex.sets||[]).reduce((n,s) => n + s.sets*s.reps, 0);
    const nSets = (ex.sets||[]).reduce((n,s) => n + s.sets, 0);
    return Math.max(20, reps*6 + nSets*2);
  }
  /*
   * Algoritmo calorico stimato:
   *  kcal = MET × 3.5 × peso(kg, default 75) / 200 × minuti_lavoro × fattore_intensità
   *  + componente volume: kg totali sollevati × 0.0045 kcal/kg (sovraccarico extra)
   *  Limitata per esercizio a valori realistici.
   */
  function estimateCalories(ex, bodyKg){
    const meta = global.SWT_DATA.MUSCLE_META[ex.muscle] || global.SWT_DATA.MUSCLE_META.custom;
    const w = bodyKg || 75;
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
    exs.forEach(e => {
      const st = s.items[e.uid];
      if(st === "done"){
        cal += estimateCalories(e);
        vol += exerciseVolume(e);
        workSecs += exerciseWorkSecs(e);
        muscleMix[e.muscle] = (muscleMix[e.muscle]||0) + 1;
      }
    });
    const elapsedMin = Math.max(1,(endTs-startTs)/60000);
    // aggiunta calorie residue da attività generale (camminate, cambi postazione)
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
      muscleMix
    };
  }

  /* ---- Storico / analytics aggregate ---- */
  function getHistory(){ return state.history; }
  function muscleDistribution(){
    const mix = {};
    state.history.forEach(h => {
      Object.entries(h.muscleMix||{}).forEach(([m,n]) => mix[m] = (mix[m]||0)+n);
    });
    return mix;
  }

  global.SWT_STORE = {
    load, save, uid,
    getRoutines, getRoutine, createRoutine, renameRoutine, deleteRoutine,
    addExerciseToRoutine, removeExercise, updateExercise, moveExercise,
    addCustomExercise, allLibraryExercises,
    startSession, getSession, setItemStatus, setRest, endSession,
    exerciseVolume, exerciseWorkSecs, estimateCalories, getHistory, muscleDistribution
  };
})(window);
