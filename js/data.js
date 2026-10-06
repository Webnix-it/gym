/* ===== data.js — Libreria esercizi, gruppi muscolari, demo SVG animate e default routines ===== */
(function (global) {
  "use strict";

  /* ---- Gruppi muscolari (chiave -> etichetta IT) ---- */
  const MUSCLE_GROUPS = {
    biceps:   "Bicipiti",
    forearms: "Avambracci",
    shoulders:"Spalle",
    core:     "Addominali / Core",
    legs:     "Gambe",
    chest:    "Petto",
    back:     "Schiena"
  };

  /* ---- Metadati per il calcolo calorico: MET stimato + fattore intensità ---- */
  const MUSCLE_META = {
    biceps:    { met: 3.5, intensity: 0.8 },
    forearms:  { met: 3.0, intensity: 0.6 },
    shoulders: { met: 4.0, intensity: 0.9 },
    core:      { met: 4.3, intensity: 1.0 },
    legs:      { met: 5.5, intensity: 1.2 },
    chest:     { met: 4.8, intensity: 1.1 },
    back:      { met: 4.6, intensity: 1.05 },
    custom:    { met: 4.0, intensity: 1.0 }
  };

  /* ---- Demo SVG animate (stickman + attrezzo), una per tipo di movimento ---- */
  const DEMOS = {
    curl: `<svg class="demo stick" viewBox="0 0 120 100">
      <circle cx="60" cy="20" r="9"/>
      <line x1="60" y1="29" x2="60" y2="60"/>
      <g class="anim-updown">
        <path d="M60 36 L46 48 L46 34"/><path d="M60 36 L74 48 L74 34"/>
        <line class="prop" x1="38" y1="34" x2="54" y2="34"/><rect class="prop" x="36" y="28" width="5" height="12" rx="2" fill="currentColor" stroke="none" opacity=".9"/>
        <line class="prop" x1="66" y1="34" x2="82" y2="34"/><rect class="prop" x="79" y="28" width="5" height="12" rx="2" fill="currentColor" stroke="none" opacity=".9"/>
      </g>
      <line x1="60" y1="60" x2="50" y2="88"/><line x1="60" y1="60" x2="70" y2="88"/>
      <line x1="20" y1="92" x2="100" y2="92" opacity=".3"/></svg>`,
    reversecurl: `<svg class="demo stick" viewBox="0 0 120 100">
      <circle cx="60" cy="20" r="9"/>
      <line x1="60" y1="29" x2="60" y2="60"/>
      <g class="anim-wrist">
        <path d="M60 36 L46 50 L44 38"/><path d="M60 36 L74 50 L76 38"/>
        <line class="prop" x1="36" y1="38" x2="52" y2="38"/><line class="prop" x1="68" y1="38" x2="84" y2="38"/>
      </g>
      <line x1="60" y1="60" x2="50" y2="88"/><line x1="60" y1="60" x2="70" y2="88"/>
      <line x1="20" y1="92" x2="100" y2="92" opacity=".3"/></svg>`,
    lateralraise: `<svg class="demo stick" viewBox="0 0 120 100">
      <circle cx="60" cy="22" r="9"/>
      <line x1="60" y1="31" x2="60" y2="62"/>
      <g class="anim-arms">
        <line x1="60" y1="38" x2="38" y2="46"/><line x1="60" y1="38" x2="82" y2="46"/>
        <rect class="prop" x="33" y="42" width="6" height="9" rx="2"/><rect class="prop" x="81" y="42" width="6" height="9" rx="2"/>
      </g>
      <line x1="60" y1="62" x2="51" y2="90"/><line x1="60" y1="62" x2="69" y2="90"/>
      <line x1="20" y1="94" x2="100" y2="94" opacity=".3"/></svg>`,
    frontraise: `<svg class="demo stick" viewBox="0 0 120 100">
      <circle cx="60" cy="22" r="9"/>
      <line x1="60" y1="31" x2="60" y2="62"/>
      <g class="anim-updown">
        <line x1="60" y1="38" x2="42" y2="30"/><line x1="60" y1="38" x2="78" y2="30"/>
        <rect class="prop" x="37" y="25" width="6" height="9" rx="2"/><rect class="prop" x="77" y="25" width="6" height="9" rx="2"/>
      </g>
      <line x1="60" y1="62" x2="51" y2="90"/><line x1="60" y1="62" x2="69" y2="90"/>
      <line x1="20" y1="94" x2="100" y2="94" opacity=".3"/></svg>`,
    wristcurl: `<svg class="demo stick" viewBox="0 0 120 100">
      <circle cx="60" cy="26" r="9"/>
      <path d="M60 35 Q58 52 52 62"/>
      <g class="anim-wrist">
        <path d="M56 44 L44 56"/><path d="M56 44 L68 56"/>
        <line class="prop" x1="34" y1="56" x2="54" y2="56"/><line class="prop" x1="58" y1="56" x2="78" y2="56"/>
      </g>
      <line x1="52" y1="62" x2="46" y2="88"/><line x1="52" y1="62" x2="62" y2="88"/>
      <line x1="20" y1="92" x2="100" y2="92" opacity=".3"/></svg>`,
    squat: `<svg class="demo stick" viewBox="0 0 120 100">
      <g class="anim-squat">
        <circle cx="60" cy="22" r="9"/>
        <line x1="60" y1="31" x2="60" y2="58"/>
        <line x1="60" y1="38" x2="44" y2="30"/><line x1="60" y1="38" x2="76" y2="30"/>
        <line class="prop" x1="30" y1="30" x2="90" y2="30"/>
        <rect class="prop" x="26" y="24" width="6" height="12" rx="2"/><rect class="prop" x="88" y="24" width="6" height="12" rx="2"/>
        <path d="M60 58 L46 72 L48 90"/><path d="M60 58 L74 72 L72 90"/>
      </g>
      <line x1="20" y1="94" x2="100" y2="94" opacity=".3"/></svg>`,
    calf: `<svg class="demo stick" viewBox="0 0 120 100">
      <g class="anim-calf">
        <circle cx="60" cy="18" r="9"/>
        <line x1="60" y1="27" x2="60" y2="60"/>
        <line x1="60" y1="34" x2="46" y2="26"/><line x1="60" y1="34" x2="74" y2="26"/>
        <line class="prop" x1="34" y1="26" x2="86" y2="26"/>
        <line x1="60" y1="60" x2="52" y2="84"/><line x1="60" y1="60" x2="68" y2="84"/>
        <path d="M48 84 h10 M62 84 h10"/>
      </g>
      <line x1="20" y1="90" x2="100" y2="90" opacity=".3"/></svg>`,
    crunch: `<svg class="demo stick" viewBox="0 0 120 100">
      <line x1="14" y1="80" x2="106" y2="80" opacity=".3"/>
      <g class="anim-crunch">
        <circle cx="34" cy="58" r="9"/>
        <line x1="41" y1="64" x2="66" y2="76"/>
        <path d="M46 66 L52 52"/><path d="M46 66 L58 58"/>
      </g>
      <path d="M66 76 L84 62 L96 76"/><path d="M66 76 L88 72"/>
      </svg>`,
    twist: `<svg class="demo stick" viewBox="0 0 120 100">
      <line x1="14" y1="84" x2="106" y2="84" opacity=".3"/>
      <g class="anim-twist">
        <circle cx="60" cy="34" r="9"/>
        <line x1="60" y1="43" x2="60" y2="70"/>
        <line x1="60" y1="50" x2="40" y2="58"/><line x1="60" y1="50" x2="80" y2="58"/>
        <rect class="prop" x="34" y="54" width="8" height="8" rx="2"/>
      </g>
      <path d="M60 70 L44 82 L36 78"/><path d="M60 70 L76 82 L84 78"/>
      </svg>`,
    bridge: `<svg class="demo stick" viewBox="0 0 120 100">
      <line x1="14" y1="82" x2="106" y2="82" opacity=".3"/>
      <g class="anim-updown">
        <circle cx="26" cy="70" r="8"/>
        <line x1="34" y1="72" x2="66" y2="60"/>
        <path d="M66 60 L82 72 L92 82"/><path d="M66 60 L84 66 L94 82"/>
      </g>
      </svg>`,
    pushup: `<svg class="demo stick" viewBox="0 0 120 100">
      <line x1="14" y1="84" x2="106" y2="84" opacity=".3"/>
      <g class="anim-push">
        <circle cx="28" cy="56" r="9"/>
        <line x1="37" y1="60" x2="82" y2="74"/>
        <path d="M42 62 L40 80"/><path d="M42 62 L52 78"/>
      </g>
      <path d="M82 74 L96 82"/><path d="M82 74 L98 78"/>
      </svg>`,
    plank: `<svg class="demo stick" viewBox="0 0 120 100">
      <line x1="14" y1="84" x2="106" y2="84" opacity=".3"/>
      <g class="anim-updown">
        <circle cx="30" cy="58" r="9"/>
        <line x1="39" y1="62" x2="88" y2="70"/>
        <path d="M44 64 L44 80"/><path d="M84 70 L94 82"/>
      </g>
      </svg>`
  };

  /* ---- Libreria preimpostata ---- */
  const EXERCISE_LIBRARY = [
    // Bicipiti
    { id:"db-biceps-curl",        name:"Dumbbell Biceps Curl",       primary:"biceps",   secondary:"forearms", demo:"curl" },
    { id:"db-biceps-curl-rev",    name:"Dumbbell Biceps Curl Reverse",primary:"biceps",  secondary:"forearms", demo:"reversecurl" },
    { id:"bar-curl",              name:"Barbell Curl",               primary:"biceps",   secondary:"forearms", demo:"curl" },
    { id:"hammer-curl",           name:"Hammer Curl",                primary:"biceps",   secondary:"forearms", demo:"curl" },
    // Avambracci
    { id:"bb-reverse-wrist-curl", name:"Barbell Reverse Wrist Curl (version 2)", primary:"forearms", secondary:"biceps", demo:"wristcurl" },
    { id:"wrist-curl",            name:"Barbell Wrist Curl",         primary:"forearms", secondary:null,       demo:"wristcurl" },
    { id:"farmer-carry",          name:"Farmer's Walk",              primary:"forearms", secondary:"core",     demo:"curl" },
    // Spalle
    { id:"bb-rear-delt",          name:"Barbell Rear Delt Raise",    primary:"shoulders",secondary:"back",     demo:"lateralraise" },
    { id:"db-lat-front-raise",    name:"Dumbbell Lateral to Front Raise", primary:"shoulders", secondary:null, demo:"frontraise" },
    { id:"db-lateral-raise",      name:"Dumbbell Lateral Raise",     primary:"shoulders",secondary:null,      demo:"lateralraise" },
    { id:"ohp",                   name:"Overhead Press",             primary:"shoulders",secondary:"chest",    demo:"updownx" },
    // Core
    { id:"assisted-russian-twist",name:"Assisted Motion Russian Twist", primary:"core",  secondary:"shoulders", demo:"twist" },
    { id:"air-twisting-crunch",   name:"Air Twisting Crunch",        primary:"core",     secondary:null,       demo:"twist" },
    { id:"bottoms-up",            name:"Bottoms-Up",                 primary:"core",     secondary:"legs",     demo:"crunch" },
    { id:"crunch-floor",          name:"Crunch Floor",               primary:"core",     secondary:null,       demo:"crunch" },
    { id:"bridge-cross-knee",     name:"Bridge (cross knee)",        primary:"core",     secondary:"legs",     demo:"bridge" },
    { id:"plank",                 name:"Plank",                      primary:"core",     secondary:"shoulders",demo:"plank" },
    // Gambe
    { id:"bent-side-knee-pushup", name:"Bent Side Knee Push-up",     primary:"legs",     secondary:"chest",    demo:"pushup" },
    { id:"db-squat",              name:"Dumbbell Squat",             primary:"legs",     secondary:"core",     demo:"squat" },
    { id:"db-standing-calf",      name:"Dumbbell Standing Calf Raise",primary:"legs",    secondary:null,       demo:"calf" },
    { id:"bb-seated-calf",        name:"Barbell Seated Calf Raise",  primary:"legs",     secondary:null,       demo:"calf" },
    { id:"lunges",                name:"Lunges",                     primary:"legs",     secondary:"core",     demo:"squat" },
    // Petto
    { id:"push-ups",              name:"Push-up",                    primary:"chest",    secondary:"shoulders",demo:"pushup" },
    { id:"bench-press",           name:"Bench Press",                primary:"chest",    secondary:"shoulders",demo:"pushup" },
    // Schiena
    { id:"lat-pulldown",          name:"Lat Pulldown",               primary:"back",     secondary:"biceps",   demo:"updownx" },
    { id:"row-barbell",           name:"Bent-over Row",              primary:"back",     secondary:"biceps",   demo:"wristcurl" }
  ];
  // aggiungi demo mancante "updownx" alias
  DEMOS.updownx = DEMOS.lateralraise;

  /* ---- Default routines (pre-caricate) ---- */
  /* set: {reps, kg?} ripeterlo "sets" volte => sets array */
  function mkSets(list){ return list.map(s=>({sets:s.sets,reps:s.reps,kg:s.kg??0})); }

  const DEFAULT_ROUTINES = [
    {
      id:"day1", name:"Day 1 💪",
      exercises:[
        { libId:"db-biceps-curl", name:"Dumbbell Biceps Curl", muscle:"biceps",
          sets:mkSets([{sets:1,reps:20,kg:3},{sets:3,reps:12,kg:6}]) },
        { libId:"db-biceps-curl-rev", name:"Dumbbell Biceps Curl Reverse", muscle:"biceps",
          sets:mkSets([{sets:3,reps:10,kg:6}]) },
        { libId:"bent-side-knee-pushup", name:"Bent Side Knee Push-up", muscle:"legs",
          sets:mkSets([{sets:4,reps:12,kg:0}]) },
        { libId:"bb-reverse-wrist-curl", name:"Barbell Reverse Wrist Curl (version 2)", muscle:"forearms",
          sets:mkSets([{sets:4,reps:20,kg:0}]) },
        { libId:"bb-rear-delt", name:"Barbell Rear Delt Raise", muscle:"shoulders",
          sets:mkSets([{sets:3,reps:20,kg:0}]) },
        { libId:"db-lat-front-raise", name:"Dumbbell Lateral to Front Raise", muscle:"shoulders",
          sets:mkSets([{sets:4,reps:15,kg:0}]) }
      ]
    },
    {
      id:"day2", name:"Day 2 Addominali 🍫",
      exercises:[
        { libId:"assisted-russian-twist", name:"Assisted Motion Russian Twist", muscle:"core",
          sets:mkSets([{sets:2,reps:20,kg:0}]) },
        { libId:"air-twisting-crunch", name:"Air Twisting Crunch", muscle:"core",
          sets:mkSets([{sets:3,reps:20,kg:0}]) },
        { libId:"bottoms-up", name:"Bottoms-Up", muscle:"core",
          sets:mkSets([{sets:3,reps:20,kg:0}]) },
        { libId:"crunch-floor", name:"Crunch Floor", muscle:"core",
          sets:mkSets([{sets:3,reps:15,kg:3}]) },
        { libId:"bridge-cross-knee", name:"Bridge (cross knee)", muscle:"core",
          sets:mkSets([{sets:3,reps:20,kg:0}]) }
      ]
    },
    {
      id:"day3", name:"Day 3 Gambe 🍗",
      exercises:[
        { libId:"db-squat", name:"Dumbbell Squat", muscle:"legs",
          sets:mkSets([{sets:4,reps:15,kg:0}]) },
        { libId:"db-standing-calf", name:"Dumbbell Standing Calf Raise", muscle:"legs",
          sets:mkSets([{sets:4,reps:20,kg:0}]) },
        { libId:"bb-seated-calf", name:"Barbell Seated Calf Raise", muscle:"legs",
          sets:mkSets([{sets:4,reps:20,kg:0}]) }
      ]
    }
  ];

  global.SWT_DATA = { MUSCLE_GROUPS, MUSCLE_META, DEMOS, EXERCISE_LIBRARY, DEFAULT_ROUTINES, mkSets };
})(window);
