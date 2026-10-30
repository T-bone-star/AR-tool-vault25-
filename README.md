# Vault 25 — Brahmin Paddock 🐄☢️

Multiplayer-AR voor de Vault 25 LARP. Spelers zien met de **Android-app** een
paddock met vee, akkers en wild over het terrein heen. Ze **jagen**, **oogsten**,
**melken** en **leiden uitgebroken vee terug** — en zien elkaars acties.

- Eén **gedeelde wereld** op de GM-laptop: wie als eerste oogst of raakt, wint.
- **Rollen met codes**: alleen *jagers* krijgen buit van wild, alleen *boeren*
  kunnen oogsten en melken. Vee terugbrengen kan iedereen.
- Werkt op een **eigen wifi zonder internet**.
- **GM-scherm** voor spelers, rollen, tassen en inleveringen.

```
 Telefoons (app)  ──wifi──►  GM-laptop: server/  (wereld, regels, opslag)
                                  └─► http://<laptop>:8080/gm.html  (SL)
```

## Snel starten

### 1. Server op de GM-laptop
Node.js 18 of nieuwer nodig.
```bash
cd server
npm install
npm start
```
De server print het **serveradres** voor de app (bv. `192.168.1.10:8080`) en
de link naar het GM-scherm. **Verander eerst** in `server/config.js`:
`gmPassword` en de `roles`-codes.

Thuis testen zonder telefoon: open `http://localhost:8080` → SIMULATIE.

### 2. De app op Android-telefoons
De APK wordt **automatisch gebouwd door GitHub** bij elke push:
GitHub → **Actions** → laatste run "Android APK" → onderaan **Artifacts** →
`vault25-paddock-apk` (zip met de APK).

Tag je een versie (`git tag v2.0.1 && git push --tags`), dan staat de APK ook
onder **Releases** — handig om op een telefoon direct te downloaden.

Installeren: APK op de telefoon openen → "installeren uit onbekende bron"
toestaan. Updates installeren over de oude heen (vaste sleutel), dus spelers
houden hun tas en rollen.

Zelf bouwen kan ook: Android Studio + `npm install && npx cap sync android &&
npx cap open android`.

### 3. Op het event
- Wifi-router of hotspot waar laptop én telefoons op zitten (internet niet nodig).
- Laptop: `npm start`; het serveradres staat in beeld.
- Spelers: app openen → naam → eventueel rolcode → serveradres (eenmalig) → START.
- SL: GM-scherm op een tweede apparaat of op de laptop zelf.

## Spelregels in het kort

| Actie | Wie | Wat gebeurt er |
|---|---|---|
| Schieten op wild | iedereen | raak = beest dood; alleen een **jager** krijgt vlees/huid |
| Oogsten | alleen **boer** | eerste boer krijgt de oogst; akker begint opnieuw |
| Melken | alleen **boer** | 1 melk per brahmin per rustperiode |
| Vee terugleiden | iedereen | door de **poortopening**; 5 kroonkurken voor wie leidde |
| Inleveren | iedereen | tas → code → SL keurt goed op het GM-scherm |

Andere spelers zien je als figuurtje (rood = jager, geel = boer, groen = geen
rol), horen je schoten en lezen in de nieuwsregel wat je doet.

## Modi

| Modus | Nodig | Gebruik |
|---|---|---|
| START (terrein) | GPS | het event: vast GPS-anker uit `server/config.js` |
| HIER | GPS | paddock op ware grootte waar je staat |
| KAMER-AR | camera | verkleind voor je neus, binnen testen |
| SIMULATIE | niets | pc of telefoon, slepen + WASD |

Let op: in HIER en KAMER zet elke telefoon de paddock vóór zichzelf neer.
Figuurtjes van anderen kloppen dan niet met waar ze écht staan. Alleen in
TERREIN delen alle telefoons hetzelfde GPS-anker.

## Bestanden

```
server/config.js     >>> SPELREGELS, ROLCODES, GM-WACHTWOORD, ANKER <<<
server/sim.js        de gedeelde wereld + alle regels
server/server.js     netwerk, opslag (server/data/save.json), GM-toegang
server/test/         spelregeltest, netwerktest, telefooncodetest (npm test)
www/                 de app (ook geserveerd door de server)
www/js/config.js     standaard serveradres in de app
www/gm.html          GM-scherm
www/vendor/          A-Frame 1.6.0 + AR.js 3.4.7 (lokaal: werkt zonder internet)
android/             Android-project (Capacitor)
.github/workflows/   automatische APK-build
```

## Tests
```bash
cd server && npm test
```
Draait de spelregels (meerdere spelers tegelijk), een echte server met
WebSocket-clients, en de echte telefooncode tegen die server.

## Tips
- Alles in `server/config.js` aanpassen → server herstarten. De app hoeft
  niet opnieuw gebouwd te worden.
- Tassen, rollen en inleveringen staan in `server/data/save.json`. Maak daar
  tussen de speldagen een kopie van.
- Telefoon kwijt of app verwijderd? Dan is de speler een nieuwe speler. Geef
  de rol opnieuw via het GM-scherm.
- Firefox werkt niet voor GPS-AR; de app gebruikt de Android-WebView (Chrome).
