# Vault 25 — AR Brahmin Paddock 🐄☢️

Een WebAR-ervaring waarmee bezoekers met hun telefoon een Fallout-achtige
boerderij van **Vault 25** over een echte plek heen zien: brahmin en ander
vee in een omheining van touwen en paaltjes, akkers op het terrein, en wild
eromheen. Spelers **jagen** (radroaches, molerats, geckos), **oogsten** rijpe
akkers, **melken** brahmin en **leiden uitgebroken vee terug** door de poort.
Alles wat ze verzamelen gaat in een tas, die ze bij de handelspost inleveren
met een code die een SL controleert.

Werkt direct in de telefoonbrowser — **geen app-installatie nodig**.

## Hoe het werkt

- Gebouwd met [A-Frame](https://aframe.io) **1.6.0** + [AR.js](https://ar-js-org.github.io/AR.js-Docs/)
  **3.4.7** (location-based / GPS AR). ⚠ Deze versies horen bij elkaar —
  AR.js 3.4.7 vereist A-Frame 1.6.0. Upgrade ze dus nooit los van elkaar.
- Je kiest één **GPS-ankerpunt** = het middelpunt van de boerderij. Alles
  (hek, akkers, dieren) wordt in **lokale meters** rond dat punt geplaatst, dus
  het bewegen en lokken van dieren blijft vloeiend.
- Elk dier heeft een gedragsmachine: grazen → uitbreken → buiten dwalen →
  (gelokt) achter je aan lopen → terug binnen de omheining.

## Snel starten

### 1. Zet je locatie in `js/config.js`
Open `js/config.js` en pas minimaal aan:
```js
anchor: { latitude: 52.379189, longitude: 4.899431 },  // <-- jouw plek
```
Coördinaten vind je door in Google Maps op de plek te rechtsklikken.

Verder kun je hier instellen:
- **uitlijning** (`anchor.rotationDeg`): draai de hele boerderij om 'm mooi
  langs het echte terrein te leggen; **hoogte** (`anchor.groundOffsetMeters`):
  hoe ver de grond onder je telefoon ligt (standaard −1,6 m);
- **AR-gevoel** (`ar`): GPS-updateafstand en sensor-smoothing tegen trillen;
- **omheining** (`enclosure`): vorm van het hek + waar de poort/opening zit;
- **akkers** (`fields`): positie, grootte en gewas;
- **dieren** (`animals`): type, aantal, hoeveel er mogen uitbreken, kleur,
  schaal en (optioneel) een eigen 3D-model;
- **gedrag** (`behavior`): loopsnelheden, lok-hoek/afstand, uitbraaktiming.

### 2. Testen zonder opbouw — vier modi
Het startscherm (`index.html`) heeft een knop per modus; je kunt ook direct
`ar.html?mode=...` openen.

| Modus | Wat je nodig hebt | Waar | Wat je ziet |
|---|---|---|---|
| `sim` | niets (geen https nodig op localhost) | pc of telefoon, overal | 3D-wereld; slepen = kijken, WASD = lopen, spatie = actie |
| `kamer` | camera + gyro, **geen GPS** | woonkamer, kantine | camerabeeld met de paddock **verkleind** (schaal 0.2) voor je neus |
| `hier` | GPS | elk grasveld/park | paddock op ware grootte **waar jij staat** — geen coördinaten nodig |
| `terrein` | GPS + `anchor` in config | het eventterrein | de echte opstelling |

Extra: `&schaal=0.3` overschrijft de schaal (bv. `ar.html?mode=kamer&schaal=0.35`
voor een grotere kamer). In `kamer` en `hier` zet de knop **⟲ ZET VOOR MIJ**
de paddock opnieuw recht voor je neer.

**Lokaal op je pc (sim):**
```bash
cd AR-tool-vault25-
python3 -m http.server 8000
# open http://localhost:8000/ar.html?mode=sim
```

### 3. Online zetten (HTTPS verplicht!)
Telefoons geven alleen toegang tot camera + GPS via **https**. Twee makkelijke opties:

**GitHub Pages (aanbevolen):**
1. Push deze branch / merge naar `main`.
2. GitHub → repo → *Settings* → *Pages* → bron = je branch, map = `/ (root)`.
3. Open de gegeven `https://…github.io/…/` URL op je telefoon.

**Lokaal + tunnel (voor snel testen):**
```bash
# in de projectmap
python3 -m http.server 8000
# en in een tweede terminal een https-tunnel, bv.:
npx localtunnel --port 8000
```
Open de https-URL op je telefoon, **op het terrein staand**.

### 4. Spelen
Eén grote knop rechtsonder doet wat past bij waar je vizier op staat:

| Vizier op | Knop | Resultaat |
|---|---|---|
| wild | **VUUR** (rood) | raak = buit (vlees/huid); mis = het beest vlucht |
| brahmin binnen het hek | **MELK** (wit) | +1 melk, daarna 60 s rust per dier |
| rijpe akker (gloeit) | **OOGST** (geel) | opbrengst in de tas, akker begint opnieuw |
| groeiende akker | **…** | "nog niet rijp" |

**Uitgebroken vee** (melding onderin): houd het in je vizier tot het vizier
amber wordt — dan volgt het je **blik** over de grond. Het kan niet door de
touwen: leid het om het hek heen naar de **opening**. Terug binnen = 5
kroonkurken. Een teruggeleid dier blijft daarna ~90 s rustig.

**Inleveren:** 🎒 TAS → INLEVEREN → de speler toont de code (bv.
`V25-K7-TAT4-VLS2-KK5-9QX2`). De SL opent `verify.html`, typt de code in en
ziet direct of 'ie klopt en wat erin zit; met AFVINKEN herkent dat apparaat
dubbel inleveren. Daarna maakt de speler de tas leeg.
⚠ Verander `turnIn.salt` in `js/config.js` vóór het event.

Alle getallen (groeitijden, buit, trefkans, beloningen, hoeveel wild) staan in
`js/config.js`.

### 5. Speeltest (na elke config-wijziging)
```bash
cd tests && npm install && npm test
```
Speelt zonder browser een complete ronde na en meldt wat er niet klopt.

## Eigen 3D-modellen (optioneel)
Standaard gebruikt de app simpele blok-vormen (de brahmin heeft netjes twee
koppen 😄). Wil je echte modellen? Zet een `.glb` in `assets/` en verwijs ernaar
in `js/config.js`:
```js
{ type: 'brahmin', count: 3, escapes: 1, model: 'assets/brahmin.glb', scale: 1.0 },
```
Zie `assets/README.md` voor tips.

## Bestanden
```
index.html          Startscherm + keuze testmodus
ar.html             De AR-scene (laadt A-Frame + AR.js)
verify.html         Code-controle voor SL's / handelaren
css/style.css       Pip-Boy/Vault stijl
js/config.js        >>> ALLES wat je wilt aanpassen <<<
js/utils.js         Wiskunde-hulpjes + checksum
js/inventory.js     Tas, opslaan op de telefoon, inlevercode
js/farm-builder.js  Bouwt hek, akkers, dieren; richten/blikpunt; poortregel
js/animal.js        Vee: grazen, uitbreken, lokken, melken
js/wildlife.js      Wild: verschijnen, vluchten, neergaan, buit
js/interact.js      Richten + de actieknop; gewasgroei
js/ui.js            HUD, knoppen, tas, meldingen, geluid
js/bootstrap.js     Zet de scene op per modus (sim/kamer/hier/terrein)
```

## Tips voor op locatie
- **Firefox werkt niet** voor location-based AR (kan geen absoluut kompas
  uitlezen). Gebruik Chrome op Android of Safari op iOS, en zet op Android
  "nauwkeurige locatie" aan voor de browser.
- Het vizier kleurt **amber** zolang een dier je volgt — zo weten spelers
  dat het lokken werkt.
- GPS op een telefoon is op ~5–10 m nauwkeurig. Maak het hek niet te klein,
  en kalibreer het kompas (figuur-8 beweging) voor je begint.
- De fysieke omheining (echte touwen + paaltjes) mag iets ruimer staan dan de
  digitale, zodat de AR-dieren altijd "binnen" lijken.
- Test de exacte `anchor`-coördinaten ter plekke en stel ze fijn af — gebruik
  `anchor.rotationDeg` om het hek langs het terrein te draaien.
