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
const d1=S.getRoutines().find(r=>r.id==="day1");
App.openRoutine(d1.id);
App.startWorkout(d1.id);
const st = JSON.parse(w.localStorage.getItem("swt_state_v1"));
const uids = st.routines.find(x=>x.id==="day1").exercises.map(e=>e.uid);
console.log("uids:", uids.slice(0,3));
const btn = w.document.querySelector(`[data-uid="${uids[0]}"]`);
console.log("btn found:", !!btn, btn && btn.className);
if(btn){
  btn.click();
  console.log("items after click:", JSON.stringify(S.getSession().items));
}
