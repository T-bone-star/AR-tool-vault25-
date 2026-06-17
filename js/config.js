/*
 * Vault 25 AR Farm — configuratie
 * ================================
 * Dit is het ENIGE bestand dat je normaal hoeft aan te passen om de
 * ervaring op jouw echte locatie te zetten.
 *
 * Coordinatenstelsel:
 *   - We kiezen 1 GPS-ankerpunt (ANCHOR) = de "oorsprong" van de boerderij.
 *   - Al het andere (omheining, akkers, dieren) wordt geplaatst in LOKALE
 *     meters t.o.v. dat anker:  x = oost (+) / west (-),  z = zuid (+) / noord (-).
 *   - Zo blijft het bewegen/lokken van dieren vloeiend (lokale 3D i.p.v. GPS-gehannes).
 *
 * Tip om coordinaten te vinden: open Google Maps, klik op de plek,
 * rechtsklik -> de eerste regel zijn latitude, longitude.
 */

window.VAULT25_CONFIG = {

  // --- 1. GPS-anker: het middelpunt van het terrein -----------------------
  // Vervang dit door de echte coordinaten van jouw boerderij-locatie.
  anchor: {
    latitude: 52.379189,    // <-- AANPASSEN
    longitude: 4.899431,    // <-- AANPASSEN
  },

  // Toon dieren ook zonder GPS-fix (handig om binnen te testen op de bank).
  // In "demo"-modus wordt GPS genegeerd en staat de boerderij recht voor je.
  demoMode: false,

  // --- 2. De omheining (palen + touwen) -----------------------------------
  // Polygoon in lokale meters. De volgorde bepaalt de vorm van het hek.
  // Standaard is dit een rechthoek van ~16 x 12 meter.
  enclosure: {
    points: [
      { x: -8, z: -6 },
      { x:  8, z: -6 },
      { x:  8, z:  6 },
      { x: -8, z:  6 },
    ],
    postSpacing: 2.0,      // meter tussen de paaltjes langs een touw
    postHeight: 1.1,       // hoogte van een paaltje in meter
    ropeSagging: 0.12,     // hoe ver het touw doorhangt (cosmetisch)
    // De "poort" / opening waar dieren door uitbreken.
    // Index verwijst naar de zijde tussen points[index] en points[index+1].
    gate: { sideIndex: 0, widthMeters: 2.5 },
  },

  // --- 3. Akkers / velden -------------------------------------------------
  // Elk veld is een rechthoek (lokale meters) met gewasrijen.
  fields: [
    { x: -5, z:  10, width: 6, depth: 4, rows: 6, crop: 'tato'  },
    { x:  5, z:  10, width: 6, depth: 4, rows: 6, crop: 'mutfruit' },
    { x: 12, z:  0,  width: 4, depth: 8, rows: 4, crop: 'corn'  },
  ],

  // --- 4. Dieren ----------------------------------------------------------
  // count = hoeveel van dit type. escapes = hoeveel ervan mogen uitbreken.
  // model = optioneel pad naar een eigen .glb model (zie assets/README.md).
  // Laat model leeg ("") om de ingebouwde placeholder-vorm te gebruiken.
  animals: [
    { type: 'brahmin', count: 3, escapes: 1, model: '', color: '#caa472', scale: 1.0 },
    { type: 'radstag', count: 2, escapes: 1, model: '', color: '#9b7d5a', scale: 0.9 },
    { type: 'molerat', count: 2, escapes: 0, model: '', color: '#7a6b5d', scale: 0.5 },
  ],

  // --- 5. Gedrag / spelregels --------------------------------------------
  behavior: {
    grazeSpeed: 0.25,        // m/s rondscharrelen binnen het hek
    escapeSpeed: 0.6,        // m/s tijdens uitbreken
    followSpeed: 0.9,        // m/s als het dier je volgt (gelokt)
    wanderRadiusOutside: 12, // hoe ver buiten het hek een dier mag dwalen
    lureAngleDeg: 28,        // cameravizier moet binnen deze hoek op het dier staan
    lureRangeMeters: 18,     // en het dier moet binnen deze afstand zijn
    lureFollowDistance: 2.2, // het dier blijft op deze afstand voor je lopen
    escapeAfterSeconds: 8,   // na hoeveel seconden het eerste dier uitbreekt
    escapeIntervalSeconds: 20, // tijd tussen volgende uitbraken
  },

  // --- 6. Sfeer -----------------------------------------------------------
  theme: {
    label: 'VAULT 25 — BRAHMIN PADDOCK',
    primaryColor: '#3cff8e',   // Pip-Boy groen
  },
};
