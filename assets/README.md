# 3D-modellen (assets)

Zet hier optioneel je eigen `.glb` / `.gltf` modellen neer en verwijs ernaar
vanuit `js/config.js` via het `model`-veld, bijvoorbeeld:

```js
{ type: 'brahmin', count: 3, escapes: 1, model: 'assets/brahmin.glb', scale: 1.0 },
```

Laat `model: ''` leeg om de ingebouwde blok-placeholders te gebruiken
(de brahmin heeft dan netjes twee koppen).

## Tips
- Gebruik **.glb** (alles in één bestand) — dat laadt het makkelijkst in WebAR.
- Houd modellen klein (< ~2–3 MB) zodat ze snel laden op mobiel.
- Het model moet op de grond "staan" rond oorsprong (0,0,0) en richting de
  **+X-as** kijken; de code draait het dier in zijn looprichting.
- Gratis bronnen: Sketchfab (let op licentie), Quaternius, Poly Pizza.
- Optimaliseer met [gltf-transform](https://gltf-transform.dev/) of
  [glTF Report](https://gltf.report/) als een model te zwaar is.
```
