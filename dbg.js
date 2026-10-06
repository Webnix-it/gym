const fs=require("fs"),{JSDOM}=require("jsdom");
const dom=new JSDOM(fs.readFileSync("index.html","utf8"),{runScripts:"outside-only",url:"http://localhost/"});
const w=dom.window;
w.eval(fs.readFileSync("js/data.js","utf8"));
w.eval(fs.readFileSync("js/store.js","utf8"));
w.eval(fs.readFileSync("js/app.js","utf8"));
w.document.dispatchEvent(new w.Event("DOMContentLoaded"));
const S=w.SWT_STORE,App=w.App;
App.startWorkout("day1");
const st=JSON.parse(w.localStorage.getItem("swt_state_v1"));
const uids=st.routines.find(r=>r.id==="day1").exercises.map(e=>e.uid);
console.log("uids:",uids.slice(0,2));
const btn=w.document.querySelector(`[data-uid="${uids[0]}"]`);
console.log("btn found:",!!btn, btn&&btn.className);
try{ btn.click(); }catch(e){ console.log("CLICK ERROR:", e.message); }
console.log("items after click:", JSON.stringify(S.getSession().items));
process.exit(0);
