/*
 * Vault 25 Brahmin Paddock — APP-instellingen
 * ===========================================
 * Bijna alles staat op de SERVER (server/config.js): spelregels, rollen,
 * akkers, dieren, het GPS-anker. Hier staat alleen wat de telefoon zelf
 * nodig heeft voordat hij verbonden is.
 */
window.VAULT25_CONFIG = {

  // Standaard serveradres in de app (de GM-laptop op de eigen wifi).
  // Spelers kunnen het op het startscherm aanpassen; de app onthoudt het.
  // ComputerVanTom op het event-netwerk. Wisselt het IP? De app kan zelf zoeken.
  defaultServer: '192.168.68.116:8090',
  serverPort: 8090,

  // Testmodi — zie README. schaal = hoe groot de paddock getekend wordt.
  modes: {
    sim:     { scale: 1,   viewDistance: 14 },
    // 0.12: alle hokken samen (~47 m breed) passen zo in een woonkamer (~5,5 m)
    kamer:   { scale: 0.12, viewDistance: 14, cameraHeight: 1.4 },
    hier:    { scale: 1,   viewDistance: 14 },
    terrein: { scale: 1 },
  },

  ar: {
    gpsMinDistance: 1,      // meter bewegen voor een GPS-update
    smoothingFactor: 0.1,   // demping sensor-getril (kleiner = rustiger)
  },

  poseIntervalMs: 150,      // hoe vaak de telefoon zijn blik doorgeeft
};
