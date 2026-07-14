# Vault 25 — AR Brahmin Paddock 🐄☢️

Een WebAR-ervaring waarmee bezoekers met hun telefoon een Fallout-achtige
boerderij van **Vault 25** over een echte plek heen zien: brahmin en ander
vee in een omheining van touwen en paaltjes, akkers op het terrein, en dieren
die soms **uitbreken**. Richt je cameravizier op een ontsnapt dier en het
**loopt met je mee** tot je het weer binnen de omheining hebt geleid.

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

### 2. Test binnen zonder GPS
Zet in `js/config.js`:
```js
demoMode: true,
```
Dan negeert de app GPS en zet de boerderij recht voor je. Op desktop loop je
rond met **WASD/pijltjes** en kijk je met **slepen**. Handig om alles te
controleren voor je naar buiten gaat. Zet daarna weer op `false` voor de echte AR.

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

### 4. Gebruik
- Open de URL → knop **START AR** → geef camera- en locatietoegang.
- Loop rond; binnen de omheining grazen de dieren.
- Na een tijdje breekt er één uit (melding onderin).
- Houd het dier in het **ronde vizier** in het midden → het volgt je →
  loop terug naar het hek → het dier is terug. Teller bovenin houdt de score bij.

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
index.html          Startscherm + toestemmingen
ar.html             De AR-scene (laadt A-Frame + AR.js)
css/style.css       Pip-Boy/Vault stijl
js/config.js        >>> ALLES wat je wilt aanpassen <<<
js/utils.js         Wiskunde-hulpjes
js/farm-builder.js  Bouwt hek, akkers, dieren; centrale "farm"-staat
js/animal.js        Diergedrag + lok-mechaniek
js/ui.js            HUD en meldingen
js/bootstrap.js     Zet de scene op (AR- of demo-modus)
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
