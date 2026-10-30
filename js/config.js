/*
 * Vault 25 AR Farm — configuratie
 * ================================
 * Dit is het ENIGE bestand dat je normaal hoeft aan te passen.
 *
 * Coordinatenstelsel ("farm-meters"):
 *   Alles (hek, akkers, dieren, wild) staat in lokale meters rond het
 *   middelpunt van de boerderij: x = oost (+) / west (-), z = zuid (+) / noord (-).
 *   Met de `schaal` van een testmodus wordt het geheel kleiner of groter,
 *   zodat dezelfde boerderij ook in je woonkamer past.
 *
 * Testmodi (kies via het startscherm of ?mode=... in de URL):
 *   sim     — gewone 3D op pc of telefoon, geen camera/GPS. Rondkijken met
 *             slepen, lopen met WASD/pijltjes. Overal, direct.
 *   kamer   — camerabeeld + gyroscoop, GEEN GPS. De boerderij verschijnt
 *             verkleind voor je neus. Woonkamer, tuin, kantine.
 *   hier    — echte GPS-AR, maar de boerderij wordt neergezet waar JIJ
 *             staat (recht voor je). Elk grasveld of park, geen opbouw.
 *   terrein — het echte event: vast GPS-anker uit `anchor` hieronder.
 * Extra: ?schaal=0.3 overschrijft de schaal van de gekozen modus.
 */

window.VAULT25_CONFIG = {

  // --- 1. GPS-anker (alleen voor modus "terrein") --------------------------
  anchor: {
    latitude: 52.379189,    // <-- AANPASSEN naar het eventterrein
    longitude: 4.899431,    // <-- AANPASSEN
    // Draai de hele boerderij (graden) om 'm langs het terrein uit te lijnen.
    rotationDeg: 0,
    // De GPS-camera hangt op telefoonhoogte; de grond ligt zoveel lager.
    groundOffsetMeters: -1.6,
  },

  // --- AR fijnafstelling (modi "hier" en "terrein") ------------------------
  ar: {
    gpsMinDistance: 1,      // meter bewegen voor een GPS-update
    smoothingFactor: 0.1,   // demping sensor-getril (kleiner = rustiger)
  },

  // Verouderd: gebruik ?mode=sim. Staat dit op true, dan is "sim" de
  // standaard als er geen mode in de URL staat.
  demoMode: false,

  // --- Testmodi ------------------------------------------------------------
  modes: {
    sim:     { scale: 1,   viewDistance: 14 },
    // 0.2 = een hek van 16x12 m wordt 3,2 x 2,4 m: past in een woonkamer.
    kamer:   { scale: 0.2, viewDistance: 14, cameraHeight: 1.4 },
    hier:    { scale: 1,   viewDistance: 14 },
    terrein: { scale: 1 },
  },

  // --- 2. De omheining (palen + touwen) -----------------------------------
  enclosure: {
    points: [
      { x: -8, z: -6 },
      { x:  8, z: -6 },
      { x:  8, z:  6 },
      { x: -8, z:  6 },
    ],
    postSpacing: 2.0,
    postHeight: 1.1,
    ropeSagging: 0.12,
    // Opening waar dieren uitbreken — en waar je ze weer DOORHEEN moet
    // leiden. Dwars door de touwen kan niet.
    gate: { sideIndex: 0, widthMeters: 2.5 },
  },

  // --- 3. Akkers -----------------------------------------------------------
  // growSeconds = tijd van zaaien tot rijp. yield = opbrengst bij oogsten.
  // crop verwijst naar een sleutel in `items` hieronder.
  // Tip: voor het event kun je growSeconds flink verhogen (bv. 1800 = 30 min).
  fields: [
    { x: -5, z: 10, width: 6, depth: 4, rows: 6, crop: 'tato',     growSeconds: 90,  yield: 4 },
    { x:  5, z: 10, width: 6, depth: 4, rows: 6, crop: 'mutfruit', growSeconds: 120, yield: 3 },
    { x: 12, z: 0,  width: 4, depth: 8, rows: 4, crop: 'mais',     growSeconds: 150, yield: 4 },
  ],

  // --- 4. Vee ------------------------------------------------------------
  // escapes = hoeveel er mogen uitbreken. product = wat je kunt "melken"
  // (richt + actieknop, binnen het hek). Laat leeg voor geen product.
  animals: [
    { type: 'brahmin', count: 3, escapes: 1, model: '', color: '#caa472', scale: 1.0, product: 'melk' },
    { type: 'radstag', count: 2, escapes: 1, model: '', color: '#9b7d5a', scale: 0.9, product: '' },
    { type: 'molerat', count: 2, escapes: 0, model: '', color: '#7a6b5d', scale: 0.5, product: '' },
  ],

  // --- 5. Wild (jagen) ---------------------------------------------------
  // Wild verschijnt rond de boerderij (buiten het hek) en vlucht als je te
  // dichtbij komt of mist. Richt + actieknop = schieten.
  wildlife: {
    maxAlive: 4,             // max tegelijk in leven
    firstSpawnSeconds: 4,
    respawnSeconds: 15,
    spawnMinRadius: 12,      // farm-meters vanaf het midden (buiten het hek)
    spawnMaxRadius: 22,
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

  // --- 6. Gedrag / spelregels --------------------------------------------
  behavior: {
    grazeSpeed: 0.25,
    escapeSpeed: 0.6,
    followSpeed: 0.9,
    wanderRadiusOutside: 12,
    lureAngleDeg: 28,          // vizier binnen deze hoek op het dier = lokken
    lureKeepAngleDeg: 60,      // eenmaal gelokt: zo ver mag het uit het midden
    lureLoseSeconds: 3,        // zo lang uit beeld voordat je 'm kwijt bent
    lureRangeMeters: 18,
    lureFollowDistance: 2.2,
    escapeAfterSeconds: 8,
    escapeIntervalSeconds: 20,
    reEscapeSeconds: 90,       // rust na terugleiden voor hetzelfde dier opnieuw uitbreekt
    milkCooldownSeconds: 60,   // per dier
    shotCooldownSeconds: 0.7,
    maxShotRange: 25,          // farm-meters
  },

  // --- 7. Spullen + beloningen -------------------------------------------
  // code = korte afkorting in de inlevercode (alleen hoofdletters!).
  items: {
    tato:        { label: 'Tato',         code: 'TAT' },
    mutfruit:    { label: 'Mutfruit',     code: 'MUT' },
    mais:        { label: 'Maïs',         code: 'MAI' },
    melk:        { label: 'Brahmin-melk', code: 'MLK' },
    vlees:       { label: 'Vlees',        code: 'VLS' },
    huid:        { label: 'Huid',         code: 'HUI' },
    kroonkurken: { label: 'Kroonkurken',  code: 'KK'  },
  },
  rewards: {
    returnAnimal: { kroonkurken: 5 },  // per teruggeleid dier
  },

  // --- 8. Inleveren ------------------------------------------------------
  // Spelers krijgen een code die een SL controleert met verify.html.
  // VERANDER de salt vóór het event en houd 'm voor jezelf.
  turnIn: {
    buttonLabel: 'INLEVEREN BIJ DE HANDELSPOST',
    help: 'Laat deze code zien aan een SL of handelaar. Pas daarna je tas leegmaken.',
    salt: 'verander-mij-vault25',
  },

  // --- 9. Sfeer ----------------------------------------------------------
  theme: {
    label: 'VAULT 25 — BRAHMIN PADDOCK',
    primaryColor: '#3cff8e',
  },
};
