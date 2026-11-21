'use strict';
/*
 * Maakt www/js/sim-bundle.js: dezelfde spelwereld als de server (sim.js), maar
 * dan voor in de telefoon. Daarmee speelt de app door als er geen bereik is.
 *
 *   node tools/bundle-sim.js          (bundel schrijven)
 *   node tools/bundle-sim.js --check  (faalt als de bundel verouderd is)
 */
const fs = require('fs');
const path = require('path');

const SRV = path.join(__dirname, '..');
const OUT = path.join(SRV, '..', 'www', 'js', 'sim-bundle.js');
const MODS = ['./geo', './radio-texts', './sim'];

function build() {
  const parts = MODS.map(m => {
    const src = fs.readFileSync(path.join(SRV, m + '.js'), 'utf8');
    return `  ${JSON.stringify(m)}: function (module, exports, require) {\n${src}\n  },`;
  });
  return `/* AUTOMATISCH GEMAAKT door server/tools/bundle-sim.js — niet met de hand aanpassen.
 * De spelwereld van de server, voor offline spelen op de telefoon. */
(function () {
  const defs = {
${parts.join('\n')}
  };
  const cache = {};
  function req(name) {
    if (cache[name]) return cache[name].exports;
    const module = { exports: {} };
    cache[name] = module;
    defs[name](module, module.exports, req);
    return module.exports;
  }
  window.V25 = window.V25 || {};
  window.V25.SimWorld = req('./sim').World;
})();
`;
}

const out = build();
if (process.argv.includes('--check')) {
  const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (cur !== out) { console.error('✗ www/js/sim-bundle.js is verouderd: draai node tools/bundle-sim.js'); process.exit(1); }
  console.log('✓ sim-bundle.js is actueel');
} else {
  fs.writeFileSync(OUT, out);
  console.log('✓ geschreven: ' + path.relative(process.cwd(), OUT));
}
