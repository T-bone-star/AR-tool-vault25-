'use strict';
// GM-schermtest: het echte gm.html in jsdom, verbonden met een echte server.
// Klikt op knoppen en controleert dat de wereld verandert. Draaien: node test/gm.test.js
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { JSDOM } = require('jsdom');
const WebSocket = require('ws');

const PORT = 20000 + Math.floor(Math.random() * 1000);
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'v25g-'));
const base = JSON.parse(JSON.stringify(require('../config')));
const CFGFILE = path.join(os.tmpdir(), `v25g-cfg-${process.pid}.json`);
fs.writeFileSync(CFGFILE, JSON.stringify(base));

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? '✓' : '✗'} ${name} ${extra}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: String(PORT), V25_DATA: DATA, V25_CONFIG: CFGFILE }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
  for (let i = 0; i < 50 && !log.includes('draait'); i++) await sleep(100);

  const errors = [];
  try {
    const html = fs.readFileSync(path.join(__dirname, '..', '..', 'www', 'gm.html'), 'utf8');
    const dom = new JSDOM(html, {
      url: `http://127.0.0.1:${PORT}/gm.html`, runScripts: 'dangerously', pretendToBeVisual: true,
      beforeParse(win) {
        win.WebSocket = WebSocket;
        win.confirm = () => true;
        win.addEventListener('error', (e) => errors.push(e.message));
      },
    });
    const w = dom.window, $ = (id) => w.document.getElementById(id);
    const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

    $('pw').value = 'fout'; click($('go')); await sleep(400);
    check('fout wachtwoord: blijft op inlogscherm', !$('login').hidden && /Verkeerd/.test($('login-msg').textContent));

    $('pw').value = base.gmPassword; click($('go')); await sleep(1500);
    check('inloggen werkt', $('login').hidden && !$('app').hidden);
    check('rolcodes zichtbaar voor SL', $('codes').textContent.includes(base.roles.jager.code));
    const q = (sel) => w.document.querySelector(sel);
    check('5 hokken op het GM-scherm', w.document.querySelectorAll('#pens .pen').length === 5);
    check('3 gebouwd, 2 niet', w.document.querySelectorAll('#pens .pen.off').length === 2);
    check('wildstand toont 4 gebieden', w.document.querySelectorAll('#sectors .sect').length === 4);

    // Konijnenren bouwen en konijnen erbij zetten
    click(q('button[data-penon="1"][data-pen="konijnen"]')); await sleep(1300);
    check('konijnenren gebouwd', !q('button[data-penon="1"][data-pen="konijnen"]') && q('button[data-penon="0"][data-pen="konijnen"]'));
    click(q('button[data-add="konijn"][data-pen="konijnen"]')); await sleep(300);
    click(q('button[data-add="konijn"][data-pen="konijnen"]')); await sleep(1300);
    const kon = [...w.document.querySelectorAll('#pens .pen')].find(e => /Konijnenren/.test(e.textContent));
    check('2 konijnen in de ren', /2\/8 dieren/.test(kon.textContent), kon.textContent.replace(/\s+/g, ' ').slice(0, 120));

    // Kippenhok kapot
    click(q('button[data-pcond="kapot"][data-pen="kippen"]')); await sleep(1300);
    check('kippenhok op KAPOT', q('button[data-pcond="kapot"][data-pen="kippen"]').classList.contains('on'));
    check('paddock blijft GOED', q('button[data-pcond="goed"][data-pen="paddock"]').classList.contains('on'));
    check('radiobericht noemt het kippenhok', /kippenhok/i.test($('radio-list').textContent));

    // Uitbraak in de wei
    click(q('button[data-esc="wei"]')); await sleep(400);
    check('melding na uitbraak-knop', /breekt uit/.test($('gm-msg').textContent), $('gm-msg').textContent);
    await sleep(6000);
    check('uitgebroken schaap/geit zichtbaar bij LOS', /(Schaap|Geit) \(Schapen- en geitenwei\)/.test($('animals').textContent), $('animals').textContent);

    // Wildstand x2
    click(w.document.querySelector('#mult-seg button[data-mult="2"]')); await sleep(1300);
    check('wildstand x2 actief', w.document.querySelector('#mult-seg button.on').dataset.mult === '2');
    check('maximum verdubbeld', new RegExp(`maximaal ${base.wildlife.maxAlive * 2}`).test($('wild-info').textContent), $('wild-info').textContent);

    // Eigen radiobericht + ophalen door de "radio"
    $('radio-text').value = 'Proef proef, hier de spelleiding.';
    click($('btn-radio')); await sleep(1300);
    check('eigen radiobericht wacht op de radio', /wacht op de radio · Proef proef/.test($('radio-list').textContent));
    let r = await fetch(`http://127.0.0.1:${PORT}/radio/next`);
    let got = []; while (r.status === 200) { got.push((await r.json()).text); r = await fetch(`http://127.0.0.1:${PORT}/radio/next`); }
    check('radio haalt alle wachtende berichten op, daarna 204', got.length >= 2 && r.status === 204 && got.some(t => /Proef proef/.test(t)), `(${got.length})`);
    await sleep(1300);
    check('GM ziet ze als uitgezonden', /uitgezonden/.test($('radio-list').textContent) && !/wacht op de radio/.test($('radio-list').textContent));

    check('geen JavaScript-fouten op het GM-scherm', errors.length === 0, errors.join(' | '));
    w.close();
  } catch (e) {
    console.error(e); fail++;
  } finally {
    srv.kill('SIGKILL');
    fs.rmSync(DATA, { recursive: true, force: true });
    fs.rmSync(CFGFILE, { force: true });
  }
  console.log(`\n${pass} geslaagd, ${fail} gefaald`);
  process.exit(fail ? 1 : 0);
})();
