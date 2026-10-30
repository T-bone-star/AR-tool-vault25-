# 3D-modellen (assets)

Zet hier optioneel je eigen `.glb`-modellen neer en verwijs ernaar vanuit
**`server/config.js`** via het `model`-veld van een diersoort:

```js
{ type: 'brahmin', count: 3, escapes: 1, color: '#caa472', scale: 1.0, product: 'melk', model: 'assets/brahmin.glb' },
```

Laat `model: ''` leeg voor het ingebouwde blokmodel (de brahmin heeft dan
netjes twee koppen).

Let op: modellen in deze map zitten in de app. Na het toevoegen van een model
moet de APK opnieuw gebouwd worden (pushen naar GitHub is genoeg).

## Tips
- Gebruik **.glb** (alles in één bestand).
- Houd modellen klein (< ~2–3 MB).
- Het model staat op de grond rond (0,0,0) en kijkt richting de **+X-as**.
- Gratis bronnen: Quaternius, Poly Pizza, Sketchfab (let op licentie).
