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

  port: 8080,

  // Wachtwoord voor het GM-scherm (http://<laptop>:8080/gm.html). VERANDEREN.
  gmPassword: 'verander-mij',

  // --- Rollen ---------------------------------------------------------------
  // Spelers typen de code in de app (bij starten of later in hun tas).
  // Eén code per rol; geef 'm aan wie de rol in-game heeft. VERANDEREN.
  roles: {
    jager: { label: 'Jager', code: 'SPOOR-25' },
    boer:  { label: 'Boer',  code: 'ZAAD-25' },
  },
  rules: {
    // Wie geen jager is, kan wel schieten en raken, maar krijgt geen buit.
    huntLootRole: 'jager',
    // Alleen boeren kunnen oogsten en melken.
    harvestRole: 'boer',
    milkRole: 'boer',
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

  // --- Paddock ---------------------------------------------------------------
  enclosure: {
    points: [
      { x: -8, z: -6 }, { x: 8, z: -6 }, { x: 8, z: 6 }, { x: -8, z: 6 },
    ],
    postSpacing: 2.0,
    postHeight: 1.1,
    gate: { sideIndex: 0, widthMeters: 2.5 },
  },

  // growSeconds = zaaien tot rijp. Voor het event flink hoger (1800+).
  fields: [
    { x: -5, z: 10, width: 6, depth: 4, rows: 6, crop: 'tato',     growSeconds: 90,  yield: 4 },
    { x:  5, z: 10, width: 6, depth: 4, rows: 6, crop: 'mutfruit', growSeconds: 120, yield: 3 },
    { x: 12, z: 0,  width: 4, depth: 8, rows: 4, crop: 'mais',     growSeconds: 150, yield: 4 },
  ],

  // model = optioneel eigen .glb in www/assets/ (bv. 'assets/brahmin.glb'); leeg = blokmodel
  animals: [
    { type: 'brahmin', count: 3, escapes: 1, color: '#caa472', scale: 1.0, product: 'melk', model: '' },
    { type: 'radstag', count: 2, escapes: 1, color: '#9b7d5a', scale: 0.9, product: '' },
    { type: 'molerat', count: 2, escapes: 0, color: '#7a6b5d', scale: 0.5, product: '' },
  ],

  wildlife: {
    maxAlive: 4,
    firstSpawnSeconds: 4,
    respawnSeconds: 15,
    spawnMinRadius: 12,
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
    milkCooldownSeconds: 60,
    shotCooldownSeconds: 0.7,
    maxShotRange: 25,
    actionRangeMeters: 22,     // max afstand voor oogsten/melken (farm-meters)
  },

  items: {
    tato:        { label: 'Tato' },
    mutfruit:    { label: 'Mutfruit' },
    mais:        { label: 'Maïs' },
    melk:        { label: 'Brahmin-melk' },
    vlees:       { label: 'Vlees' },
    huid:        { label: 'Huid' },
    kroonkurken: { label: 'Kroonkurken' },
  },

  rewards: {
    returnAnimal: { kroonkurken: 5 },
  },

  turnIn: {
    buttonLabel: 'INLEVEREN BIJ DE HANDELSPOST',
    help: 'Noem deze code bij de handelspost. De SL ziet je inlevering op het GM-scherm.',
  },

  theme: { label: 'VAULT 25 — BRAHMIN PADDOCK' },
};
