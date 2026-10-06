/* Test di verifica: interazioni UI tramite click reali (delega eventi) */
const fs = require("fs");
const { JSDOM } = require("jsdom");
const html = fs.readFileSync("index.html","utf8");
const dom = new JSDOM(html, { runScripts:"outside-only", url:"http://localhost/" });
const w = dom.window;
w.eval(fs.readFileSync("js/data.js","utf8"));
w.eval(fs.readFileSync("js/store.js","utf8"));
w.eval(fs.readFileSync("js/app.js","utf8"));
w.document.dispatchEvent(new w.Event("DOMContentLoaded"));
const S=w.SWT_STORE, App=w.App;
let failures=0;
function ok(c,m){ console.log((c?"PASS ✔ ":"FAIL ✘ ")+m); if(!c) failures++; }

// 1. click su card scheda -> apre dettaglio
const card = w.document.querySelector(".routine-card[data-rid='day1']");
ok(!!card,"card Day 1 renderizzata");
card.click();
ok(w.document.querySelector("#view-routines").innerHTML.includes("Dumbbell Biceps Curl"),"click card apre dettaglio scheda");

// 2. click aggiungi dalla libreria -> vista libreria
w.document.querySelector('[onclick="App.gotoLibrary()"]').click();
ok(w.document.querySelector("#view-library").classList.contains("active"),"click 'Vai alla libreria' cambia vista");

// 3. filtro chips
w.document.querySelector('[onclick="App.filterLib(\'legs\')"]').click();
const libHtml = w.document.querySelector("#view-library").innerHTML;
ok(libHtml.includes("Dumbbell Squat") && !libHtml.includes("Air Twisting Crunch"),"click chip filtro gambe");

// 4. quick add con click
const before = S.getRoutine("day1").exercises.length;
const addBtn = w.document.querySelector('#lib-db-squat [onclick*="quickAdd"]');
addBtn.click();
ok(S.getRoutine("day1").exercises.length===before+1,"click Aggiungi rapido funziona");

// 5. torna alle schede e riordino/eliminazione via click
App.backToRoutines(); App.openRoutine("day1");
const upBtns = w.document.querySelectorAll('#view-routines [data-uid][data-rid][onclick*="moveEx"]');
ok(upBtns.length>=2,"pulsanti move renderizzati");
const lastUid = S.getRoutine("day1").exercises.slice(-1)[0].uid;
const downOrUp = Array.from(w.document.querySelectorAll(`[data-uid="${lastUid}"][onclick*="moveEx"]`))[0];
if(downOrUp){ downOrUp.click(); ok(S.getRoutine("day1").exercises.slice(-2,-1)[0].uid===lastUid,"click sposta esercizio"); }

// remove via click
const rmBtn = w.document.querySelector(`#view-routines [data-uid="${lastUid}"][onclick*="removeEx"]`);
const cntBefore = S.getRoutine("day1").exercises.length;
rmBtn.click();
ok(S.getRoutine("day1").exercises.length===cntBefore-1,"click rimuovi esercizio");

// 6. edit sets via click + save
const setBtn = w.document.querySelector('#view-routines [onclick*="editSetsModal"]');
setBtn.click();
ok(w.document.querySelector("#modalCard").innerHTML.includes("Serie"),"modale set aperta via click");
w.document.querySelector("#m-sets [data-f='kg']").value = "12";
w.document.querySelector('[onclick^="App.saveSets"]').click();
const firstKg = S.getRoutine("day1").exercises[0].sets[0].kg;
ok(firstKg===12,"salvataggio kg via click modale");

// 7. rinomina scheda via click
w.document.querySelector('#view-routines [onclick*="renameRoutine"]').click();
w.document.querySelector("#m-rrename").value = "Giorno A";
w.document.querySelector('[onclick^="App.renameFromModal"]').click();
ok(S.getRoutine("day1").name==="Giorno A","rinomina scheda via click");

// 8. nuova scheda via click
w.document.querySelector('[onclick="App.newRoutine()"]').click();
w.document.querySelector("#m-rname").value="Test Click";
w.document.querySelector('[onclick="App.createRoutineFromModal()"]').click();
ok(S.getRoutines().some(r=>r.name==="Test Click"),"creazione scheda via click");

// 9. live: avvio, stato, rest, fine — tutto via click
const startBtn = w.document.querySelector(`#view-routines [data-rid="day1"][onclick*="startWorkout"]`) ||
                 (()=>{ App.backToRoutines(); return w.document.querySelector('.routine-card[data-rid="day1"] [onclick*="startWorkout"]'); })();
startBtn.click();
ok(!!S.getSession(),"sessione avviata via click Avvia");
const chk = w.document.querySelector("#view-routines .status-btn.check");
chk.click();
const uid1 = chk.getAttribute("data-uid");
ok(S.getSession().items[uid1]==="done","completamento via click check");
w.document.querySelector('[onclick="App.startRest(90)"]').click();
ok(S.getSession().restUntil>Date.now(),"recupero 90s via click");
w.document.querySelector('[onclick="App.clearRest()"]').click();
ok(!S.getSession().restUntil,"stop recupero via click");
w.document.querySelector('[onclick="App.finishWorkout()"]').click();
w.document.querySelector("#m-end").value = ""; // usa default now
App.confirmManualEnd();
const rec=S.getHistory()[0];
ok(rec && rec.done>=1 && rec.calories>0,"report generato con dati corretti (done="+rec.done+", kcal="+rec.calories+")");

// 10. dashboard via tab click
w.document.querySelector('.tab[data-view="dashboard"]').click();
ok(w.document.querySelector("#view-dashboard").innerHTML.includes("pie"),"dashboard con pie chart dopo tab click");

console.log(failures?`\n${failures} FAILURES`:"\nALL UI CLICK TESTS PASSED");
process.exit(failures?1:0);
