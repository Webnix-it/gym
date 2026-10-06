/* ===== data.js — Libreria esercizi, gruppi muscolari, animazioni e default routines ===== */
(function (global) {
  "use strict";

  /* ---- Gruppi muscolari (chiave -> etichetta IT + colore per la dashboard) ---- */
  const MUSCLE_GROUPS = {
    biceps:    { label: "Bicipiti",          color: "#FFB300" },
    forearms:  { label: "Avambracci",        color: "#FFD54F" },
    shoulders: { label: "Spalle",            color: "#FF5E00" },
    core:      { label: "Addominali / Core", color: "#FFC107" },
    legs:      { label: "Gambe",             color: "#FF8A50" },
    chest:     { label: "Petto",             color: "#FFE082" },
    back:      { label: "Schiena",           color: "#E65100" }
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

  /* ============================================================
   * ANIMAZIONI: definizioni di pose per tipo di movimento.
   * Ogni pose = angolazioni articolari; il motore SWT_ANIM
   * (js/anim.js) interpola e genera SVG animati con SMIL —
   * omino scheletrico vettoriale + attrezzi (bilanciere, manubri,
   * panca, lat machine), seconda figura in dissolvenza che mostra
   * la posizione finale del movimento (range of motion).
   * Stile ispirato a librerie open-source di illustrazioni fitness
   * (es. "fitness-anatomy" CC-BY, set icone workout MIT): qui tutto
   * generato proceduralmente in vanilla JS/SVG, zero dipendenze.
   * Convenzione angoli: 0° = arto verso il basso, 90° = avanti/destra,
   * 180° = sopra il capo, segno invertito per il lato destro.
   * ============================================================ */
  const H = global.SWT_ANIM && global.SWT_ANIM.hiLo ? global.SWT_ANIM.hiLo : ((lo,hi,o)=>Object.assign({poses:[lo,hi],hi,lo},o||{}));

  const POSES = {
    /* --- BICIPITI / AVAMBRACCI --- */
    curl: H(
      { neckL: 6,  elbL: 14, neckR: -6, elbR: -14 },
      { neckL: 14, elbL: 118, neckR: -14, elbR: -118 },
      { dur: 1.5, props: ["dumbL","dumbR"] }),
    hammer: H(
      { neckL: 8,  elbL: 20, neckR: -8, elbR: -20 },
      { neckL: 16, elbL: 105, neckR: -16, elbR: -105 },
      { dur: 1.5, props: ["dumbL","dumbR"] }),
    reversecurl: H(
      { neckL: 4,  elbL: 10, neckR: -4, elbR: -10 },
      { neckL: 10, elbL: 95, neckR: -10, elbR: -95 },
      { dur: 1.4, props: ["bar"] }),
    wristcurl: H(
      { sit: true, neckL: 78, elbL: 30, neckR: -78, elbR: -30 },
      { sit: true, neckL: 84, elbL: 78, neckR: -84, elbR: -78 },
      { dur: 1.2, props: ["bar"] }),

    /* --- SPALLA --- */
    lateralraise: H(
      { neckL: 12, elbL: 4, neckR: -12, elbR: -4 },
      { neckL: 82, elbL: 6, neckR: -82, elbR: -6 },
      { dur: 1.7, props: ["dumbL","dumbR"] }),
    frontraise: H(
      { neckL: 4,   elbL: 0, neckR: -4, elbR: 0 },
      { neckL: 168, elbL: 6, neckR: -168, elbR: -6 },
      { dur: 1.7, props: ["dumbL","dumbR"] }),
    reardeelt: H(
      { lean: 42, neckL: 30, elbL: 8, neckR: -30, elbR: -8 },
      { lean: 42, neckL: 96, elbL: 0, neckR: -96, elbR: 0 },
      { dur: 1.7, props: ["dumbL","dumbR"] }),
    ohp: H(
      { neckL: 62,  elbL: 96, neckR: -62, elbR: -96 },
      { neckL: 172, elbL: 6,  neckR: -172, elbR: -6 },
      { dur: 1.8, props: ["bar"] }),

    /* --- GAMBE --- */
    squat: H(
      { neckL: 60, elbL: 40, neckR: -60, elbR: -40, hipL: 6,  kneeL: -6,  hipR: -6,  kneeR: 6,  crouch: 0 },
      { neckL: 96, elbL: 44, neckR: -96, elbR: -44, hipL: 52, kneeL: -96, hipR: -52, kneeR: 96, crouch: 18, lean: -14 },
      { dur: 2.0, props: ["dumbL","dumbR"] }),
    lunge: H(
      { neckL: 8, elbL: 10, neckR: -8, elbR: -10, hipL: 22, kneeL: -26, hipR: -18, kneeR: 12, crouch: 0 },
      { neckL: 8, elbL: 10, neckR: -8, elbR: -10, hipL: 62, kneeL: -96, hipR: -46, kneeR: 88, crouch: 16 },
      { dur: 1.9, props: ["dumbL","dumbR"] }),
    calf: H(
      { neckL: 176, elbL: 4, neckR: -176, elbR: -4, crouch: 2 },
      { neckL: 176, elbL: 4, neckR: -176, elbR: -4, crouch: -6 },
      { dur: 1.5, props: ["bar"] }),
    seatedcalf: H(
      { sit: true, neckL: 40, elbL: 40, neckR: -40, elbR: -40, kneeL: 96, kneeR: 96 },
      { sit: true, neckL: 40, elbL: 40, neckR: -40, elbR: -40, kneeL: 74, kneeR: 74 },
      { dur: 1.5, props: [] }),

    /* --- CORE --- */
    crunch: H(
      { lean: -96, crouch: 44, neckL: 60, elbL: 60, neckR: -60, elbR: -60, hipL: 84, kneeL: -96, hipR: 84, kneeR: -96 },
      { lean: -74, crouch: 44, neckL: 60, elbL: 60, neckR: -60, elbR: -60, hipL: 84, kneeL: -96, hipR: 84, kneeR: -96 },
      { dur: 1.5, ground: false }),
    twist: H(
      { sit: true, lean: -24, crouch: 40, neckL: 66, elbL: 24, neckR: -30, elbR: -10, kneeL: 96, kneeR: 96 },
      { sit: true, lean: -24, crouch: 40, neckL: 30, elbL: 10, neckR: -66, elbR: -24, kneeL: 96, kneeR: 96 },
      { dur: 1.8, ground: false, props: ["dumbL"] }),
    bridge: H(
      { lean: -90, crouch: 46, hipL: 60, kneeL: -100, hipR: 60, kneeR: -100, neckL: 40, elbL: 20, neckR: -40, elbR: -20 },
      { lean: -68, crouch: 38, hipL: 34, kneeL: -92,  hipR: 34, kneeR: -92,  neckL: 40, elbL: 20, neckR: -40, elbR: -20 },
      { dur: 1.8, ground: false }),
    plank: H(
      { lean: -84, crouch: 42, hipL: 8, kneeL: -8, hipR: -8, kneeR: 8, neckL: -84, elbL: 84, neckR: -84, elbR: -84 },
      { lean: -82, crouch: 43, hipL: 8, kneeL: -8, hipR: -8, kneeR: 8, neckL: -84, elbL: 84, neckR: -84, elbR: -84 },
      { dur: 2.4, ground: false }),
    legraise: H(
      { lean: -92, crouch: 44, hipL: 4, kneeL: -4, hipR: -4, kneeR: 4, neckL: -86, elbL: 80, neckR: -86, elbR: -80 },
      { lean: -92, crouch: 44, hipL: 82, kneeL: -14, hipR: 78, kneeR: -14, neckL: -86, elbL: 80, neckR: -86, elbR: -80 },
      { dur: 1.9, ground: false }),

    /* --- PETTO --- */
    pushup: H(
      { lean: -84, crouch: 42, hipL: 6, kneeL: -6, hipR: -6, kneeR: 6, neckL: -80, elbL: 76, neckR: -80, elbR: -76 },
      { lean: -78, crouch: 44, hipL: 6, kneeL: -6, hipR: -6, kneeR: 6, neckL: -34, elbL: 18, neckR: -34, elbR: -18 },
      { dur: 1.6, ground: false }),
    bench: H(
      { lean: -90, crouch: 40, hipL: 66, kneeL: -92, hipR: 66, kneeR: -92, neckL: -30, elbL: 14, neckR: -30, elbR: -14 },
      { lean: -90, crouch: 40, hipL: 66, kneeL: -92, hipR: 66, kneeR: -92, neckL: -172, elbL: 4, neckR: -172, elbR: -4 },
      { dur: 1.8, ground: false, props: ["bar"], bench: true }),
    flye: H(
      { lean: -90, crouch: 40, hipL: 66, kneeL: -92, hipR: 66, kneeR: -92, neckL: -150, elbL: 18, neckR: -150, elbR: -18 },
      { lean: -90, crouch: 40, hipL: 66, kneeL: -92, hipR: 66, kneeR: -92, neckL: -60, elbL: 30, neckR: -60, elbR: -30 },
      { dur: 1.9, ground: false, props: ["dumbL","dumbR"], bench: true }),

    /* --- SCHIENA --- */
    pulldown: H(
      { sit: true, neckL: 156, elbL: 24, neckR: -156, elbR: -24, kneeL: 96, kneeR: 96 },
      { sit: true, neckL: 60,  elbL: 84, neckR: -60,  elbR: -84, kneeL: 96, kneeR: 96 },
      { dur: 1.9, props: ["bar"], lat: true }),
    row: H(
      { lean: 48, neckL: 172, elbL: 14, neckR: -172, elbR: -14, hipL: 14, kneeL: -16, hipR: -14, kneeR: 16 },
      { lean: 44, neckL: 118, elbL: 70, neckR: -118, elbR: -70, hipL: 14, kneeL: -16, hipR: -14, kneeR: 16 },
      { dur: 1.7, props: ["bar"] }),
    deadlift: H(
      { lean: 64, neckL: 176, elbL: 4, neckR: -176, elbR: -4, hipL: 40, kneeL: -60, hipR: -40, kneeR: 60, crouch: 22 },
      { lean: 4,  neckL: 178, elbL: 2, neckR: -178, elbR: -2, hipL: 2,  kneeL: -6,  hipR: -2,  kneeR: 6,  crouch: 0 },
      { dur: 2.1, props: ["bar"] }),

    /* --- METABOLICO --- */
    farmer: H(
      { neckL: 4,  elbL: 6, neckR: -4, elbR: -6, hipL: 20,  kneeL: -30, hipR: -20, kneeR: 30, crouch: 1 },
      { neckL: -8, elbL: 8, neckR: 8,  elbR: -8, hipL: -14, kneeL: 10,  hipR: 14,  kneeR: -34, crouch: 1 },
      { dur: 1.1, props: ["dumbL","dumbR"] }),
    burpee: H(
      { lean: 6, neckL: 178, elbL: 2, neckR: -178, elbR: -2, hipL: 4, kneeL: -4, hipR: -4, kneeR: 4, crouch: -8 },
      { lean: -80, crouch: 44, hipL: 10, kneeL: -12, hipR: -10, kneeR: 12, neckL: -70, elbL: 60, neckR: -70, elbR: -60 },
      { dur: 2.2, props: [] }),

    /* --- ESTENSIONI (pose dedicate per più varietà visiva) --- */
    // crocifisso inverso a busto flesso: deltoide posteriore / schiena (apertura a T)
    reversefly: H(
      { lean: 45, neckL: 8,  elbL: 10, neckR: -8,  elbR: -10, hipL: 10, kneeL: -12, hipR: -10, kneeR: 12 },
      { lean: 45, neckL: 88, elbL: 6,  neckR: -88, elbR: -6,  hipL: 10, kneeL: -12, hipR: -10, kneeR: 12 },
      { dur: 1.7, props: ["dumbL","dumbR"] }),
    // french curl / estensioni tricipiti sopra il capo (gomito fisso, avambraccio che apre)
    skullcrusher: H(
      { neckL: 168, elbL: 70, neckR: -168, elbR: -70 },
      { neckL: 168, elbL: 8,  neckR: -168, elbR: -8  },
      { dur: 1.6, props: ["bar"] }),
    // kickback tricipiti: busto flesso, avambraccio che distende indietro
    kickback: H(
      { lean: 55, neckL: 55, elbL: 85, neckR: -55, elbR: -85, hipL: 14, kneeL: -18, hipR: -14, kneeR: 18 },
      { lean: 55, neckL: 55, elbL: 4,  neckR: -55, elbR: -4,  hipL: 14, kneeL: -18, hipR: -14, kneeR: 18 },
      { dur: 1.5, props: ["dumbL","dumbR"] }),
    // crunch a ruota (ab wheel): da ginocchia, busto che si allunga in avanti
    abwheel: H(
      { lean: -92, crouch: 40, hipL: 78, kneeL: -100, hipR: 78, kneeR: -100, neckL: -74, elbL: 80, neckR: -74, elbR: -80 },
      { lean: -58, crouch: 40, hipL: 78, kneeL: -100, hipR: 78, kneeR: -100, neckL: -30, elbL: 30, neckR: -30, elbR: -30 },
      { dur: 2.0, ground: false }),
    // hyperextension / back extension: busto che risale da flesso in appoggio
    hyperext: H(
      { lean: 62, crouch: 34, hipL: -8, kneeL: 8, hipR: 8, kneeR: -8, neckL: 62, elbL: 20, neckR: -62, elbR: -20 },
      { lean: -6, crouch: 34, hipL: -8, kneeL: 8, hipR: 8, kneeR: -8, neckL: 62, elbL: 20, neckR: -62, elbR: -20 },
      { dur: 1.9, ground: false })
  };

  // alias demo storiche -> chiave pose
  const DEMO_ALIAS = {
    "curl":"curl", "reversecurl":"reversecurl", "lateralraise":"lateralraise",
    "frontraise":"frontraise", "wristcurl":"wristcurl", "squat":"squat",
    "calf":"calf", "crunch":"crunch", "twist":"twist", "bridge":"bridge",
    "pushup":"pushup", "plank":"plank", "updownx":"ohp"
  };

  function animSvg(demoKey){
    if(!global.SWT_ANIM) return "";
    const key = DEMO_ALIAS[demoKey] || demoKey;
    return global.SWT_ANIM.build(POSES[key] || POSES.curl);
  }

  const DEMOS = Object.keys(POSES);

  /* ---- Libreria preimpostata (30+ esercizi, ognuno con animazione dedicata) ---- */
  const EXERCISE_LIBRARY = [
    // Bicipiti
    { id:"db-biceps-curl",        name:"Dumbbell Biceps Curl",         primary:"biceps",   secondary:"forearms", demo:"curl",
      desc:"In piedi, gomiti fermi ai fianchi: fletti l'avambraccio portando il manubrio all'altezza della spalla senza oscillare il busto.", tip:"Controlla la fase negativa (2-3 sec in discesa)." },
    { id:"db-biceps-curl-rev",    name:"Dumbbell Biceps Curl Reverse", primary:"biceps",   secondary:"forearms", demo:"reversecurl",
      desc:"Presa prona (palme verso il basso): coinvolge brachiale e avambracci oltre al bicipite.", tip:"Carico più leggero rispetto al curl classico." },
    { id:"bar-curl",              name:"Barbell Curl",                 primary:"biceps",   secondary:"forearms", demo:"reversecurl",
      desc:"Bilanciere con presa supina, risalita completa del gomito evitando slanci delle spalle.", tip:"Addome contratto per proteggere la lombare." },
    { id:"hammer-curl",           name:"Hammer Curl",                  primary:"biceps",   secondary:"forearms", demo:"hammer",
      desc:"Presa neutra a martello: massima attivazione del brachiale e dell'avambraccio.", tip:"Gomiti aderenti al tronco durante tutto il ROM." },
    // Avambracci
    { id:"bb-reverse-wrist-curl", name:"Barbell Reverse Wrist Curl (version 2)", primary:"forearms", secondary:"biceps", demo:"wristcurl",
      desc:"Avambracci appoggiati, polsi che estendono e flettono il bilanciere con presa prona.", tip:"Movimento lento e completo, senza rimbalzi." },
    { id:"wrist-curl",            name:"Barbell Wrist Curl",           primary:"forearms", secondary:null,       demo:"wristcurl",
      desc:"Flessione dei polsi con presa supina: isola i flessori dell'avambraccio.", tip:"Massima escursione: mani giù a braccia tese, poi su." },
    { id:"farmer-carry",          name:"Farmer's Walk",                primary:"forearms", secondary:"core",     demo:"farmer",
      desc:"Cammina portando manubri pesanti lungo i fianchi: grip, trapezi e core in isometria.", tip:"Spalle indietro, passo corto e veloce." },
    // Spalle
    { id:"bb-rear-delt",          name:"Barbell Rear Delt Raise",      primary:"shoulders",secondary:"back",     demo:"reardeelt",
      desc:"Busto inclinato in avanti, braccia che aprono all'indietro per colpire il deltoide posteriore.", tip:"Non superare l'altezza delle spalle." },
    { id:"db-lat-front-raise",    name:"Dumbbell Lateral to Front Raise", primary:"shoulders", secondary:null,  demo:"frontraise",
      desc:"Serie combinata: alzata laterale seguita da alzata frontale, pompaggio completo del deltoide.", tip:"Alternare lateral/front senza pausa tra le rep." },
    { id:"db-lateral-raise",      name:"Dumbbell Lateral Raise",       primary:"shoulders",secondary:null,      demo:"lateralraise",
      desc:"Braccia semitese che si aprono lateralmente fino all'orizzontale: isolamento deltoide medio.", tip:"Mignolo leggermente più alto del gomito in cima." },
    { id:"ohp",                   name:"Overhead Press",               primary:"shoulders",secondary:"chest",    demo:"ohp",
      desc:"Spinta del bilanciere dal petto sopra il capo con glutei e addome contratti.", tip:"Traiettoria verticale, testa che scivola indietro." },
    { id:"face-pull",             name:"Face Pull (cavo)",             primary:"shoulders",secondary:"back",     demo:"reversefly",
      desc:"Tiro del cavo verso il viso con gomiti alti: salute della cuffia dei rotatori e postura.", tip:"Presa larga, rotazione esterna finale." },
    // Core
    { id:"assisted-russian-twist",name:"Assisted Motion Russian Twist",primary:"core",     secondary:"shoulders",demo:"twist",
      desc:"Seduto con busto inclinato, torsioni controllate del tronco con peso tra le mani.", tip:"Sono gli obliqui a ruotare, non le braccia." },
    { id:"air-twisting-crunch",   name:"Air Twisting Crunch",          primary:"core",     secondary:null,       demo:"crunch",
      desc:"Crunch a corpo libero con torsione: gomito verso il ginocchio opposto ad ogni rep.", tip:"Espira nella contrazione massima." },
    { id:"bottoms-up",            name:"Bottoms-Up",                   primary:"core",     secondary:"legs",     demo:"crunch",
      desc:"Crunch inverso: bacino che risale da terra portando le ginocchia verso il petto.", tip:"Non usare lo slancio: contrôla anche la discesa." },
    { id:"crunch-floor",          name:"Crunch Floor",                 primary:"core",     secondary:null,       demo:"crunch",
      desc:"Classico crunch a terra con scapole che si sollevano, anche con disco sul petto.", tip:"Lombare sempre incollata al pavimento." },
    { id:"bridge-cross-knee",     name:"Bridge (cross knee)",          primary:"core",     secondary:"legs",     demo:"bridge",
      desc:"Ponte glutei con ginocchia che si alternano verso il basso: core e catena posteriore.", tip:"Contrai i glutei in cima per 1 secondo." },
    { id:"plank",                 name:"Plank",                        primary:"core",     secondary:"shoulders",demo:"plank",
      desc:"Tenuta isometrica su avambracci e punta dei piedi, corpo allineato come una tavola.", tip:"Respira normalmente, bacino né su né giù." },
    { id:"leg-raise",             name:"Leg Raise",                    primary:"core",     secondary:"legs",     demo:"legraise",
      desc:"Seduto a terra o su panca: gambe tese che si sollevano verso il busto per il retto addominale basso.", tip:"Mani a terra accanto alle anche per stabilità." },
    // Gambe
    { id:"bent-side-knee-pushup", name:"Bent Side Knee Push-up",       primary:"legs",     secondary:"chest",    demo:"pushup",
      desc:"Variante di spinta con appoggio su ginocchia e traiettoria laterale del busto.", tip:"Core attivo per evitare cadute laterali." },
    { id:"db-squat",              name:"Dumbbell Squat",               primary:"legs",     secondary:"core",     demo:"squat",
      desc:"Squat con manubri ai fianchi: discesa sotto il parallelo con schiena neutra.", tip:"Peso sui talloni, ginocchia che seguono le punte." },
    { id:"db-standing-calf",      name:"Dumbbell Standing Calf Raise", primary:"legs",     secondary:null,       demo:"calf",
      desc:"Elevazione dei talloni in piedi con manubrio/bilanciere: gastrocnemio in allungamento completo.", tip:"Pausa di 1 sec in basso per eliminare il riflesso elastico." },
    { id:"bb-seated-calf",        name:"Barbell Seated Calf Raise",    primary:"legs",     secondary:null,       demo:"seatedcalf",
      desc:"Da seduto con carico sulle ginocchia: isola il soleo.", tip:"ROM completo: tallone giù e spinta in punta." },
    { id:"lunges",                name:"Lunges",                       primary:"legs",     secondary:"core",     demo:"lunge",
      desc:"Affondo camminato con manubri: quadricipiti, glutei e stabilità mono-podalica.", tip:"Ginocchio posteriore sfiora terra senza toccare." },
    { id:"bulgarian-split-squat", name:"Bulgarian Split Squat",        primary:"legs",     secondary:"glutes",   demo:"lunge",
      desc:"Affondo bulgaro con piede posteriore in appoggio sulla panca: forza unilaterale pura.", tip:"Busto leggermente inclinato per attivare il gluteo." },
    { id:"rdl",                   name:"Romanian Deadlift",            primary:"legs",     secondary:"back",     demo:"deadlift",
      desc:"Stacco rumeno: bacino indietro con gambe quasi tese, stretch degli ischio-crurali.", tip:"Bilanciere che scorre lungo le cosce, schiena piatta." },
    // Petto
    { id:"push-ups",              name:"Push-up",                      primary:"chest",    secondary:"shoulders",demo:"pushup",
      desc:"Spinte a corpo libero con corpo rigido: petto, deltoidi anteriori e tricipiti.", tip:"Gomiti a 45°, petto che sfiora terra." },
    { id:"bench-press",           name:"Bench Press",                  primary:"chest",    secondary:"shoulders",demo:"bench",
      desc:"Distensione del bilanciere su panca piana: esercizio re per petto e tricipiti.", tip:"Scapole ritratte, leggera arcata lombare." },
    { id:"db-flye",               name:"Dumbbell Flye",                primary:"chest",    secondary:"shoulders",demo:"flye",
      desc:"Apertura a croce con manubri su panca: allungamento massimo dei pettorali.", tip:"Gomiti semitesi e fissi: il movimento è del braccio intero." },
    // Schiena
    { id:"lat-pulldown",          name:"Lat Pulldown",                 primary:"back",     secondary:"biceps",   demo:"pulldown",
      desc:"Tirata alta alla lat machine: dorsali che portano la barra al petto alto.", tip:"Inizia tirando i gomiti, non con le mani." },
    { id:"row-barbell",           name:"Bent-over Row",                primary:"back",     secondary:"biceps",   demo:"row",
      desc:"Rematore con bilanciere, busto a 45°: spessore di dorsali, romboidi e trapezio medio.", tip:"Porta il bilanciere all'ombelico, niente strappi." },
    { id:"deadlift",              name:"Deadlift",                     primary:"back",     secondary:"legs",     demo:"deadlift",
      desc:"Stacco da terra classico: catena posteriore completa dalla posizione bassa.", tip:"Respira e blocca il core prima della tirata." },
    { id:"back-extension",        name:"Back Extension (Hyperextension)", primary:"back",  secondary:"core",     demo:"hyperext",
      desc:"Busto che risale dall'estensione su panca romana: erettori spinali e glutei.", tip:"Non iperestendere in alto: linea neutra con le gambe." },
    // Tricipiti (secondari nei movimenti di spinta, isolabili con queste proposte)
    { id:"skull-crusher",         name:"Skull Crusher",                primary:"chest",    secondary:"shoulders",demo:"skullcrusher",
      desc:"Bilanciere sopra il capo, gomiti fermi: l'avambraccio apre e chiude attorno al tricipite.", tip:"Tieni i gomiti stretti, non farli aprire a ventaglio." },
    { id:"tri-kickback",          name:"Triceps Kickback",             primary:"chest",    secondary:"shoulders",demo:"kickback",
      desc:"Busto flesso in avanti, braccio che distende indietro contro resistenza: picco di contrazione del tricipite.", tip:"Spalla ferma: lavora solo il gomito." },
    // Core avanzato
    { id:"ab-wheel",              name:"Ab Wheel Rollout",             primary:"core",     secondary:"shoulders",demo:"abwheel",
      desc:"Ruota addominale da ginocchia: busto che si allunga in avanti mantenendo il core rigidissimo.", tip:"Bacino retroverso: se la lombare inarca, ridurre il ROM." },
    { id:"burpee",                name:"Burpee",                       primary:"core",     secondary:"legs",     demo:"burpee",
      desc:"Da in piedi a plank con salti: esercizio metabolico completo per fiato e definizione.", tip:"Ritmo costante: qualità del movimento prima della velocità." },
    // Gambe extra
    { id:"hip-thrust",            name:"Hip Thrust",                   primary:"legs",     secondary:"core",     demo:"bridge",
      desc:"Ponte d'anca con carico sul bacino: massima contrazione del grande gluteo.", tip:"Mento verso il petto, costole chiuse, spingi coi talloni." }
  ];

  /* ---- Default routines (pre-caricate) ---- */
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

  global.SWT_DATA = { MUSCLE_GROUPS, MUSCLE_META, POSES, DEMO_ALIAS, DEMOS, animSvg, EXERCISE_LIBRARY, DEFAULT_ROUTINES, mkSets };

  /* ---- Demo routines: sessioni simulate sparse (ultimi ~3 mesi) per popolare la dashboard ---- */
  function buildDemoHistory(){
    const lib = EXERCISE_LIBRARY;
    const pick = id => lib.find(e => e.id === id);
    // template di schede demo: [nome, [{libId, sets, reps, kg}...], MET-ish kcal base]
    const TEMPLATES = [
      ["Spinta & Trazione 💪", [["bench-press",4,10,60],["row-barbell",4,10,55],["ohp",3,12,35],["lat-pulldown",3,12,45]], null],
      ["Full Body Braccia",    [["db-biceps-curl",3,12,10],["hammer-curl",3,10,12],["db-lateral-raise",4,15,6],["push-ups",3,15,0]], null],
      ["Gambe Complete 🦵",    [["db-squat",4,12,30],["lunges",3,12,14],["rdl",4,10,50],["db-standing-calf",4,18,20]], null],
      ["Core Circuit 🔥",      [["crunch-floor",3,20,0],["assisted-russian-twist",3,20,5],["plank",3,15,0],["leg-raise",3,15,0]], null],
      ["Pull Pesante",         [["deadlift",5,5,90],["row-barbell",4,8,60],["lat-pulldown",4,10,50],["bar-curl",3,10,20]], null],
      ["Push Day",             [["bench-press",5,8,65],["ohp",4,10,40],["db-flye",3,12,10],["push-ups",3,20,0]], null],
      ["Leg Day Light",        [["db-squat",3,15,20],["bulgarian-split-squat",3,10,12],["bb-seated-calf",4,20,15]], null],
      ["Mix Metabolico",       [["farmer-carry",4,12,22],["push-ups",4,15,0],["crunch-floor",4,20,0],["db-lat-front-raise",3,15,6]], null]
    ];
    const hist = [];
    const DAY = 86400000;
    const now = Date.now();
    let seed = 20261007;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

    for(let d = 88; d >= 1; d -= Math.max(1, Math.round(2 + rnd()*4))){   // sessione ogni 2-6 giorni
      const t = TEMPLATES[Math.floor(rnd()*TEMPLATES.length)];
      const exs = t[1].map(([id,s,r,kg])=>{ const e = pick(id)||pick("push-ups"); return { muscle:e.primary, sets:s, reps:r, kg }; });
      let cal = 0, vol = 0, workSecs = 0;
      const muscleMix = {};
      exs.forEach(e=>{
        const meta = MUSCLE_META[e.muscle] || MUSCLE_META.custom;
        const reps = e.sets*e.reps;
        const ws = Math.max(20, reps*6 + e.sets*2);
        cal += meta.met*3.5*78/200*(ws/60)*meta.intensity + e.sets*e.reps*e.kg*0.0045;
        vol += e.sets*e.reps*e.kg;
        workSecs += ws;
        muscleMix[e.muscle] = (muscleMix[e.muscle]||0)+1;
      });
      const startTs = now - d*DAY + (17 + Math.floor(rnd()*3))*3600000;
      const durMs = (workSecs/60)*1000*60*(1.9+rnd()*0.8);
      const total = exs.length;
      const done = Math.max(1, total - (rnd()<0.7 ? 0 : 1));
      const skipped = rnd()<0.25 ? 1 : 0;
      hist.push({
        id: "demo_" + d, routineId: "demo", routineName: t[0],
        startTs, endTs: startTs + durMs, durationMs: durMs, workSecs,
        calories: Math.round(cal) + Math.round(durMs/60000*1.1),
        volumeKg: Math.round(vol),
        total, done, skipped, pending: Math.max(0, total-done-skipped),
        completion: Math.round(done/total*100),
        muscleMix,
        exDetail: t[1].map(([id,s,r,kg])=>{ const e = pick(id)||pick("push-ups"); return { name: e.name, volume: s*r*kg, kcal: 0 }; })
      });
    }
    return hist; // dal più vecchio al più nuovo: lo ordiniamo noi all'uso
  }

  global.SWT_DATA.buildDemoHistory = buildDemoHistory;
})(window);
