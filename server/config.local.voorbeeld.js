/*
 * Jouw GEHEIME instellingen — alleen op ComputerVanTom, nooit op GitHub.
 *
 *   cp config.local.voorbeeld.js config.local.js
 *   nano config.local.js            (codes invullen)
 *   sudo systemctl restart vault25-paddock
 *
 * Alles wat hier staat overschrijft config.js. Wat je weglaat blijft zoals in
 * config.js. config.local.js staat in .gitignore, dus "git pull" laat het met rust.
 */
module.exports = {
  gmPassword: 'kies-een-wachtwoord',

  roles: {
    jager: { code: 'JAGER-CODE' },
    boer:  { code: 'BOER-CODE' },
    vee1:  { code: 'VEE1-CODE' },
    vee2:  { code: 'VEE2-CODE' },
    vee3:  { code: 'VEE3-CODE' },
  },

  // Optioneel: de bunkerradio moet dan ?token=... meesturen
  // radio: { token: '' },
};
