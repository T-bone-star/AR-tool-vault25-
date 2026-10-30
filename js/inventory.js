/*
 * Vault 25 AR Farm — de tas (inventaris) + inlevercode
 *
 * De tas blijft bewaard op de telefoon (localStorage), ook als de pagina
 * herlaadt. Bij inleveren krijgt de speler een code als:
 *     V25-K7-TAT4-VLS2-KK5-9QX2
 *     |   |  |-- spullen --|  |-- controlecode (checksum)
 *     |   '-- volgnummer (zodat je dubbel inleveren herkent)
 * Een SL controleert de code met verify.html.
 */
(function () {
  window.V25 = window.V25 || {};
  const CFG = window.VAULT25_CONFIG;
  const KEY = 'v25-inventaris';

  const inv = { items: {} };
  try { inv.items = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { inv.items = {}; }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(inv.items)); } catch (e) { /* privé-venster */ }
  }
  function changed(key, n) {
    document.dispatchEvent(new CustomEvent('inv-change', { detail: { key, n, items: inv.items } }));
  }

  inv.add = (key, n = 1) => {
    inv.items[key] = (inv.items[key] || 0) + n;
    save();
    changed(key, n);
  };
  inv.total = () => Object.values(inv.items).reduce((a, b) => a + b, 0);
  inv.label = (key) => (CFG.items && CFG.items[key] && CFG.items[key].label) || key;
  inv.clear = () => { inv.items = {}; save(); changed(null, 0); };

  // Codeer de tas. Volgorde volgt CFG.items zodat de code stabiel is.
  inv.makeCode = () => {
    const parts = Object.keys(CFG.items)
      .filter(k => inv.items[k] > 0)
      .map(k => CFG.items[k].code + inv.items[k]);
    if (!parts.length) return null;
    const serial = Math.random().toString(36).slice(2, 4).toUpperCase().padEnd(2, 'X');
    const body = ['V25', serial, ...parts].join('-');
    return body + '-' + V25.utils.hash(CFG.turnIn.salt + body);
  };

  // Ontleed + controleer een code (gebruikt door verify.html).
  inv.checkCode = (raw) => {
    const code = String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
    const parts = code.split('-');
    if (parts.length < 4 || parts[0] !== 'V25') return { ok: false, reason: 'Geen Vault 25-code.' };
    const chk = parts.pop();
    const body = parts.join('-');
    const valid = V25.utils.hash(CFG.turnIn.salt + body) === chk;
    const byCode = {};
    for (const k in CFG.items) byCode[CFG.items[k].code] = k;
    const items = [];
    for (const p of parts.slice(2)) {
      const m = /^([A-Z]+)(\d+)$/.exec(p);
      if (!m || !byCode[m[1]]) return { ok: false, reason: `Onbekend onderdeel: ${p}` };
      items.push({ key: byCode[m[1]], label: inv.label(byCode[m[1]]), n: +m[2] });
    }
    return { ok: valid, reason: valid ? '' : 'Controlecode klopt niet — overgetypt of verzonnen?',
      serial: parts[1], items };
  };

  V25.inv = inv;
})();
