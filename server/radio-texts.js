/*
 * Radioberichten van de paddock voor FreeRadical.
 *
 * Elk bericht heeft twee vormen:
 *   text   — kant-en-klaar om voor te lezen (Piper), als de radio geen LLM gebruikt
 *   prompt — de feiten + opdracht, als de radio FreeRadical het zelf laat zeggen
 *
 * Pas de zinnen gerust aan. {placeholders} worden ingevuld door de server.
 * Er wordt per keer willekeurig één variant gekozen.
 */
module.exports = {
  escape: [
    'Bewoners van Vault 25, hier FreeRadical. Er loopt al {minuten} minuten een {dier} los aan de {richting}kant van de paddock. Niemand? Echt niemand? Dan wordt het straks soep voor de geckos.',
    'FreeRadical meldt: een {dier} heeft de vrijheid ontdekt, {richting}kant van de paddock, al {minuten} minuten. Boeren, jagers, voorbijgangers — wie brengt hem thuis?',
    'Even onderbreken voor een dierenwelzijnsmoment. Er dwaalt een {dier} rond bij de paddock, aan de {richting}kant. Breng hem terug door de poort, er staan kroonkurken tegenover.',
  ],
  escapeMany: [
    'Bewoners van Vault 25, FreeRadical hier. Er lopen nu {aantal} dieren los rond de paddock. Dat is geen boerderij meer, dat is een uittocht. Iemand naar buiten, nu.',
    'Alarm vanuit de ether: {aantal} beesten buiten de paddock, de oudste al {minuten} minuten. Wie wil er vanavond nog melk?',
  ],
  idle: [
    'Hier FreeRadical. Al {minuten} minuten heeft niemand de paddock bezocht. {details} Ik zeg niks. Ik zeg alleen: buiten wacht werk.',
    'Bewoners van Vault 25, de paddock ligt er verlaten bij. {details} Gaat er nog iemand naar buiten, of eten we vanavond blikvoer?',
    'Een stille paddock is een hongerige vault. {details} Wie pakt zijn jas?',
  ],
  conditionBeschadigd: [
    'FreeRadical meldt schade aan de paddock. Het hek houdt het nog, maar niet lang. Wie heeft er touw en paaltjes?',
    'Bericht voor de boeren: de paddock is beschadigd. Reken erop dat er vee gaat zwerven tot het hek gemaakt is.',
  ],
  conditionKapot: [
    'Noodbericht van FreeRadical: de paddock is kapot. Het vee loopt waar het wil. Boeren, jagers, iedereen met twee handen — naar buiten.',
    'De paddock is aan flarden. Wat er nog binnen staat, staat er niet lang meer. Herstel het hek of zeg het vee vaarwel.',
  ],
  conditionGoed: [
    'Goed nieuws in de ether: de paddock is hersteld. Het vee blijft weer waar het hoort. Applaus voor wie het hek maakte.',
  ],
  depleted: [
    'Jagers, even luisteren. Aan de {richting}kant van de paddock is het wild zo goed als op. Laat het gebied met rust, of loop wat verder.',
    'FreeRadical meldt: de {richting}kant is leeggejaagd. Daar komt voorlopig niets meer uit de bosjes.',
  ],

  // Opdracht voor het taalmodel als de radio FreeRadical het zelf laat zeggen
  promptIntro: 'Je bent FreeRadical, de piratenradio-DJ van Vault 25. Meld dit kort (twee of drie zinnen, Nederlands) op de radio, spreek de bewoners van Vault 25 aan, blijf in karakter:',
};
