const fs = require("fs");
const { JSDOM } = require("jsdom");

const html = fs.readFileSync("index.html","utf8");
const dom = new JSDOM(html, { runScripts:"outside-only", url:"http://localhost/" });
const w = dom.window;

// localStorage mock (jsdom lo supporta già con url http)
w.eval(fs.readFileSync("js/data.js","utf8"));
w.eval(fs.readFileSync("js/store.js","utf8"));
w.eval(fs.readFileSync("js/app.js","utf8"));


function routineExUids(rid){
  const st = JSON.parse(w.localStorage.getItem("swt_state_v1"));
  const r = st.routines.find(x=>x.id===rid);
  return r.exercises.map(e=>e.uid);
}

let failures = 0;
function ok(cond,msg){ console.log((cond?"PASS ✔ ":"FAIL ✘ ")+msg); if(!cond) failures++; }

// init
w.document.dispatchEvent(new w.Event("DOMContentLoaded"));

const D=w.SWT_DATA, S=w.SWT_STORE, App=w.App;

ok(D.EXERCISE_LIBRARY.length>=20, "libreria esercizi popolata ("+D.EXERCISE_LIBRARY.length+")");
ok(Object.keys(D.MUSCLE_GROUPS).length===7, "7 gruppi muscolari");

// default routines
let rts=S.getRoutines();
ok(rts.length===3, "3 schede di default pre-caricate");
const d1=rts.find(r=>r.id==="day1");
ok(d1 && d1.name==="Day 1 💪" && d1.exercises.length===6, "Day 1: 6 esercizi");
const curl=d1.exercises[0];
ok(curl.sets.length===2 && curl.sets[0].sets===1 && curl.sets[0].reps===20 && curl.sets[0].kg===3 && curl.sets[1].sets===3 && curl.sets[1].kg===6,
   "Dumbbell Curl: 1x20@3kg + 3x12@6kg");
const d2=rts.find(r=>r.id==="day2"); ok(d2 && d2.exercises.length===5, "Day 2: 5 esercizi core");
const d3=rts.find(r=>r.id==="day3"); ok(d3 && d3.exercises.length===3, "Day 3: 3 esercizi gambe");

// persistenza
ok(w.localStorage.getItem("swt_state_v1"), "stato salvato in LocalStorage");

// CRUD routine
const nr = S.createRoutine("Test Routine");
ok(S.getRoutines().length===4, "creazione scheda");
S.renameRoutine(nr.id," rinominata");
ok(S.getRoutine(nr.id).name===" rinominata", "rinomina scheda");

// aggiungi esercizio + set config
const item = S.addExerciseToRoutine(nr.id,{name:"Custom X",muscle:"biceps",sets:[{sets:3,reps:10,kg:8}]});
ok(S.getRoutine(nr.id).exercises.length===1,"aggiunta esercizio a scheda");
S.updateExercise(nr.id,item.uid,{sets:[{sets:4,reps:8,kg:10}]});
ok(S.getRoutine(nr.id).exercises[0].sets[0].kg===10,"aggiornamento serie/reps/kg");
// riordino
const i2=S.addExerciseToRoutine(nr.id,{name:"Secondo",muscle:"legs",sets:[{sets:1,reps:1,kg:0}]});
S.moveExercise(nr.id,i2.uid,-1);
ok(S.getRoutine(nr.id).exercises[0].name==="Secondo","riordinamento esercizi");
S.removeExercise(nr.id,i2.uid);
ok(S.getRoutine(nr.id).exercises.length===1,"cancellazione esercizio");

// volume & calorie
const ex=S.getRoutine(nr.id).exercises[0];
ok(S.exerciseVolume(ex)===4*8*10, "volume = 4x8x10 = 320 kg");
ok(S.estimateCalories(ex)>0, "calorie stimate > 0 ("+S.estimateCalories(ex)+" kcal)");

// UI: viste
App.openRoutine(d1.id);
ok(w.document.querySelector("#view-routines").innerHTML.includes("Dumbbell Biceps Curl"),"dettaglio scheda renderizzato");
App.gotoLibrary();
ok(w.document.querySelector("#view-library").innerHTML.includes("Barbell Reverse Wrist Curl"),"libreria renderizzata con demo SVG");
ok(w.document.querySelector("#view-library").innerHTML.includes("anim-box"),"animazioni demo presenti");
App.filterLib("core");
const libHtml=w.document.querySelector("#view-library").innerHTML;
ok(libHtml.includes("Air Twisting Crunch") && !libHtml.includes("Dumbbell Squat"),"filtro per gruppo muscolare");
App.filterLib("all");

// quick add alla scheda attiva
const before=S.getRoutine(d1.id).exercises.length;
App.quickAdd("push-ups");
ok(S.getRoutine(d1.id).exercises.length===before+1,"aggiunta rapida da libreria alla scheda attiva");

// live workout
App.startWorkout(d1.id);
const s=S.getSession(); ok(s && s.routineId===d1.id,"sessione live avviata");
ok(w.document.querySelector("#liveClock"),"UI live renderizzata");
const uids = routineExUids(d1.id);
// verifica che l'uid reale sia presente nell'HTML live e simula click sul pulsante
const btnDone = w.document.querySelector(`[data-uid="${uids[0]}"]`);
ok(!!btnDone, "pulsante stato con data-uid renderizzato");
if(btnDone) btnDone.click();
const btnSkip = w.document.querySelector(`[data-uid="${uids[1]}"].skip`) || Array.from(w.document.querySelectorAll(`[data-uid="${uids[1]}"]`)).find(b=>b.className.includes("skip"));
if(btnSkip) btnSkip.click();
ok(S.getSession().items[uids[0]]==="done" && S.getSession().items[uids[1]]==="skip","stati completato/saltato (via click UI)");
App.startRest(60);
ok(S.getSession().restUntil>Date.now(),"timer recupero attivo");
App.clearRest();

// fine sessione manuale tramite UI (Termina sessione -> modale tempi manuali)
App.finishWorkout();
const modalHtml = w.document.querySelector("#modalCard").innerHTML;
ok(modalHtml.includes("datetime-local"), "modale inizio/fine manuale mostrata");
const fakeStart = Date.now()-30*60*1000;
const p=n=>String(n).padStart(2,"0"); const fd=d=>`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
w.document.querySelector("#m-start").value = fd(new Date(fakeStart));
w.document.querySelector("#m-end").value = fd(new Date());
App.confirmManualEnd();
const rec = S.getHistory()[0];
ok(rec && rec.calories>0 && rec.completion>0 && rec.durationMs>0, "report sessione: kcal="+rec.calories+", comp="+rec.completion+"%");
ok(S.getHistory().length===1,"storico aggiornato");
ok(!S.getSession(),"sessione chiusa");

// dashboard
App.gotoDashboard();
const dash=w.document.querySelector("#view-dashboard").innerHTML;
ok(dash.includes("pie"),"grafico a torta renderizzato");
ok(dash.includes("Storico sessioni"),"sezione storico presente");
ok(dash.includes(rec.routineName),"sessione visibile nello storico");

// ripristino stato (reload simulato)
w.eval("SWT_STORE.load()");
ok(S.getHistory().length===1,"ripristino automatico stato da LocalStorage");

console.log(failures? `\n${failures} FAILURES` : "\nALL TESTS PASSED");
process.exit(failures?1:0);
