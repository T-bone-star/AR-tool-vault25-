/*
 * Vault 25 Brahmin Paddock — SERVERCONFIG
 * =======================================
 * Dit is het bestand voor SL's. Alles wat het spel bepaalt staat hier, op de
 * GM-laptop. De Android-app hoeft NOOIT opnieuw gebouwd te worden als je hier
 * iets verandert: server herstarten is genoeg.
 *
 * Codes en het GM-wachtwoord staan alleen hier, nooit in de app — spelers
 * kunnen ze dus niet uit de app halen.
 */
module.exports = {

  // 8090: poort 8080 is op ComputerVanTom al in gebruik door gm_control.html
  port: 8090,

  // Wachtwoord voor het GM-scherm (http://<pc>:8090/gm.html). VERANDEREN.
  gmPassword: 'verander-mij',

  // --- Rollen ---------------------------------------------------------------
  // Spelers typen de code in de app (bij starten of later in hun tas).
  // Eén code per rol; geef 'm aan wie de rol in-game heeft. VERANDEREN.
  // Veeboer volgt de skill "Boer vee niveau 1/2/3": je mag vee verzorgen tot en
  // met jouw niveau (niveau 2 mag ook niveau-1-vee). group + level regelen dat.
  roles: {
    jager: { label: 'Jager', code: 'SPOOR-25' },
    boer:  { label: 'Boer (gewassen)', code: 'ZAAD-25' },
    vee1:  { label: 'Veeboer 1', code: 'HOK-1', group: 'veeboer', level: 1 },
    vee2:  { label: 'Veeboer 2', code: 'HOK-2', group: 'veeboer', level: 2 },
    vee3:  { label: 'Veeboer 3', code: 'HOK-3', group: 'veeboer', level: 3 },
  },
  rules: {
    // Wie geen jager is, kan wel schieten en raken, maar krijgt geen buit.
    huntLootRole: 'jager',
    // Alleen boeren kunnen oogsten.
    harvestRole: 'boer',
    // Vee verzorgen (eieren rapen, scheren, mest…): veeboer van minstens het
    // niveau van het dier.
    careGroup: 'veeboer',
    // Vee terugbrengen: iedereen (null = geen rol nodig).
    returnRole: null,
  },

  // --- Plek ------------------------------------------------------------------
  // Alleen voor modus "terrein". Wordt naar alle telefoons gestuurd.
  anchor: {
    latitude: 52.379189,     // AANPASSEN naar het eventterrein
    longitude: 4.899431,
    rotationDeg: 0,
    groundOffsetMeters: -1.6,
  },

  // growSeconds = zaaien tot rijp. Voor het event flink hoger (1800+).
  fields: [
    { x: -5, z: 10, width: 6, depth: 4, rows: 6, crop: 'tato',     growSeconds: 90,  yield: 4 },
    { x:  5, z: 10, width: 6, depth: 4, rows: 6, crop: 'mutfruit', growSeconds: 120, yield: 3 },
    { x: 12, z: 0,  width: 4, depth: 8, rows: 4, crop: 'mais',     growSeconds: 150, yield: 4 },
  ],

  // --- Vee --------------------------------------------------------------------
  // Soorten en niveaus uit de barter/resources-lijst van Vault 25.
  // products = wat een verzorgd dier oplevert, met om de hoeveel MINUTEN (1 stuk).
  //   Productnamen = component lore Dierlijk, zodat de handelspost met de
  //   gewone resourcekaartjes kan uitbetalen.
  // speed = hoe snel het wegloopt bij een uitbraak (1 = normaal).
  // model = optioneel eigen .glb in www/assets/ (bv. 'assets/brahmin.glb').
  species: {
    konijn:  { label: 'Konijn',  level: 1, color: '#d8cfc4', speed: 1.6, products: { mest: 30, haar: 60 } },
    kip:     { label: 'Kip',     level: 1, color: '#e8e2d0', speed: 1.2, products: { ei: 20, veren: 45 } },
    eend:    { label: 'Eend',    level: 1, color: '#f2f2ee', speed: 1.0, products: { ei: 30, veren: 60 } },
    geit:    { label: 'Geit',    level: 2, color: '#c9b79c', speed: 1.3, products: { haar: 45, mest: 30 } },
    schaap:  { label: 'Schaap',  level: 2, color: '#ece6da', speed: 1.0, products: { haar: 40, mest: 30 } },
    koe:     { label: 'Koe',     level: 2, color: '#5a4636', speed: 0.8, products: { mest: 20 } },
    brahmin: { label: 'Brahmin', level: 3, color: '#caa472', speed: 0.9, products: { mest: 20, haar: 60 } },
    ree:     { label: 'Ree',     level: 3, color: '#a0703c', speed: 1.8, products: { mest: 40 } },
    hert:    { label: 'Hert',    level: 3, color: '#8a5a30', speed: 1.5, products: { mest: 40, botten: 120 } },
  },

  // --- Hokken -----------------------------------------------------------------
  // Elk hok heeft een eigen hektype, poort, staat (goed/beschadigd/kapot) en
  // dieren. "active" = gebouwd. Op het GM-scherm zet je een hok aan zodra
  // spelers het in-game gebouwd hebben, en zet je er dieren in (bv. na aankoop
  // bij de handelaar). Maten in meters; x = oost, z = zuid; gate = kant van de poort.
  //   style: touw (palen + touw) · hek (houten planken) · gaas (kippengaas + hok)
  //          ren (laag gaas + konijnenhok) · hoog (hoog wildraster)
  pens: [
    { id: 'paddock', label: 'Brahmin-paddock', naam: 'de brahmin-paddock', style: 'touw',
      x: 0, z: 0, width: 16, depth: 12, gate: 'noord', gateWidth: 2.5,
      species: ['brahmin', 'koe'], capacity: 6, active: true, start: { brahmin: 3, koe: 1 } },
    { id: 'wei', label: 'Schapen- en geitenwei', naam: 'de schapenwei', style: 'hek',
      x: -17, z: 0, width: 10, depth: 10, gate: 'noord', gateWidth: 2,
      species: ['schaap', 'geit'], capacity: 6, active: true, start: { schaap: 2, geit: 1 } },
    { id: 'kippen', label: 'Kippenhok', naam: 'het kippenhok', style: 'gaas', coop: true, pond: true,
      x: -15, z: 13, width: 7, depth: 5, gate: 'oost', gateWidth: 1.2,
      species: ['kip', 'eend'], capacity: 10, active: true, start: { kip: 4, eend: 2 } },
    { id: 'konijnen', label: 'Konijnenren', naam: 'de konijnenren', style: 'ren', hutch: true,
      x: 16, z: 12, width: 6, depth: 4, gate: 'west', gateWidth: 1,
      species: ['konijn'], capacity: 8, active: false, start: { konijn: 3 } },
    { id: 'hertenkamp', label: 'Hertenkamp', naam: 'het hertenkamp', style: 'hoog',
      x: 20, z: -14, width: 10, depth: 10, gate: 'west', gateWidth: 2,
      species: ['ree', 'hert'], capacity: 4, active: false, start: { ree: 1, hert: 1 } },
  ],

  wildlife: {
    maxAlive: 4,              // bij wildstand 100% en vermenigvuldiger x1
    firstSpawnSeconds: 4,
    respawnSeconds: 15,
    spawnMinRadius: 16,       // vanaf het midden van alle hokken; nooit in een hok
    spawnMaxRadius: 32,
    // Wildstand per gebied rond de paddock. Elk geschoten beest maakt het
    // gebied armer; het herstelt langzaam. Waar veel gejaagd wordt, komt
    // minder wild. Op het GM-scherm schaal je de totale hoeveelheid op/af.
    sectors: ['noord', 'oost', 'zuid', 'west'],
    depletionPerKill: 0.15,   // zoveel van de stand (0–1) per geschoten beest
    killWeight: { jager: 1, anders: 1 },  // zet 'anders' hoger om stroperij zwaarder te laten wegen
    regenPerHour: 0.5,        // zoveel herstel per uur (0,5 = leeg → vol in 2 uur)
    minStockToSpawn: 0.1,     // onder deze stand verschijnt er niets meer in dat gebied
    startMultiplier: 1,       // GM-vermenigvuldiger bij de start (0 = geen wild … 3 = veel)
    types: [
      { type: 'radroach', label: 'Radroach', weight: 3, color: '#5a3a1e', speed: 1.4,
        skittishRange: 4, hitChance: 0.9, radius: 0.35, aimHeight: 0.12, scale: 1.0,
        loot: { vlees: 1 } },
      { type: 'molerat', label: 'Molerat', weight: 2, color: '#b88a7a', speed: 1.0,
        skittishRange: 5, hitChance: 0.8, radius: 0.45, aimHeight: 0.22, scale: 1.0,
        loot: { vlees: 1, huid: 1 } },
      { type: 'gecko', label: 'Gecko', weight: 1, color: '#7a8a3a', speed: 1.8,
        skittishRange: 7, hitChance: 0.65, radius: 0.45, aimHeight: 0.25, scale: 1.1,
        loot: { vlees: 2, huid: 1 } },
    ],
  },

  behavior: {
    grazeSpeed: 0.25,
    escapeSpeed: 0.6,
    followSpeed: 0.9,
    wanderRadiusOutside: 12,
    lureAngleDeg: 28,
    lureKeepAngleDeg: 60,
    lureLoseSeconds: 3,
    lureRangeMeters: 18,
    lureFollowDistance: 2.2,
    escapeAfterSeconds: 8,
    escapeIntervalSeconds: 20,
    reEscapeSeconds: 90,
    shotCooldownSeconds: 0.7,
    maxShotRange: 25,
    actionRangeMeters: 22,     // max afstand voor oogsten/melken (farm-meters)
  },

  items: {
    tato:        { label: 'Tato' },
    mutfruit:    { label: 'Mutfruit' },
    mais:        { label: 'Maïs' },
    vlees:       { label: 'Vlees' },
    huid:        { label: 'Huid/Leer' },
    // Component lore Dierlijk (bruin)
    ei:          { label: 'Ei(eren)' },
    veren:       { label: 'Veren' },
    haar:        { label: 'Haar' },
    mest:        { label: 'Mest' },
    botten:      { label: 'Botten' },
    kroonkurken: { label: 'Kroonkurken' },
  },

  rewards: {
    returnAnimal: { kroonkurken: 5 },
  },

  // --- Paddock: staat van het hek ---------------------------------------
  // Zet je op het GM-scherm op goed / beschadigd / kapot (bv. na een aanval
  // op de paddock die spelers gebouwd hebben). De staat bepaalt hoe vaak er
  // vanzelf een dier uitbreekt. GM kan ook altijd zelf een uitbraak starten.
  // Geldt per hok: elk hok heeft z'n eigen staat op het GM-scherm.
  paddock: {
    startCondition: 'goed',
    // Gemiddeld één uitbraak per zoveel minuten. 0 = nooit vanzelf.
    escapeEveryMinutes: { goed: 0, beschadigd: 12, kapot: 3 },
    maxOutside: 3,            // nooit meer dan zoveel dieren tegelijk buiten (alle hokken samen)
    // Bij "kapot" houdt het hek niets tegen: dieren lopen overal in en uit.
    // Bij "goed" en "beschadigd" kan het alleen door de poortopening.
  },

  // --- Radio (FreeRadical / bunkerradio) ----------------------------------
  // De server zet berichten klaar; de bunkerradio-Pi haalt ze op via
  // http://<deze pc>:8090/radio/next (zie radio/paddock_radio.py).
  radio: {
    enabled: true,
    token: '',                    // optioneel: ?token=... verplicht maken
    escapeUnattendedMinutes: 5,   // dier zo lang los zonder dat iemand het lokt → bericht
    idleMinutes: 45,              // zo lang niemand bij de paddock in de app → bericht
    repeatMinutes: 15,            // hetzelfde probleem niet vaker melden dan dit
    nearMeters: 60,               // "bij de paddock" = binnen zoveel meter van het midden
    announceCondition: true,      // bericht als de GM de paddock op beschadigd/kapot zet
    announceDepletedSector: true, // bericht als het wild in een gebied op is
    // Geen berichten buiten speeltijd (het spel stopt om 02:00, start om 10:00)
    quietHours: { from: '02:00', to: '10:00' },
  },

  turnIn: {
    buttonLabel: 'INLEVEREN BIJ DE HANDELSPOST',
    help: 'Noem deze code bij de handelspost. De SL ziet je inlevering op het GM-scherm.',
  },

  theme: { label: 'VAULT 25 — BRAHMIN PADDOCK' },
};
