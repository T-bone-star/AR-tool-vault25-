/*
 * Vault 25 — verbinding met de server (WebSocket)
 *
 * Instellingen komen uit localStorage (gezet op het startscherm):
 *   v25-server  "192.168.1.10:8080"
 *   v25-name    "Jan"
 *   v25-id      vaste speler-id voor deze telefoon
 *   v25-codes   rolcodes die bij de eerste keer verbinden worden ingewisseld
 *
 * Berichten van de server worden doorgegeven als DOM-events:
 *   net-hello (layout) · net-snap · net-me · net-msg · net-event · net-shot
 *   net-turnin · net-status ({state: 'connecting'|'online'|'offline'})
 */
(function () {
  window.V25 = window.V25 || {};
  const store = {
    get(k, d = '') { try { return localStorage.getItem(k) || d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* privé-venster */ } },
  };

  function playerId() {
    let id = store.get('v25-id');
    if (!id) {
      id = 'p-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      store.set('v25-id', id);
    }
    return id;
  }

  function defaultServer() {
    const saved = store.get('v25-server');
    if (saved) return saved;
    // In de browser (pagina komt van de server zelf) is de server deze host.
    const isApp = !!window.Capacitor || location.hostname === 'localhost' && !location.port;
    if (!isApp && location.host) return location.host;
    return (window.VAULT25_CONFIG && window.VAULT25_CONFIG.defaultServer) || '';
  }

  const fire = (name, detail) => document.dispatchEvent(new CustomEvent(name, { detail }));

  const net = {
    id: playerId(),
    store,
    defaultServer,
    ws: null,
    me: null,
    layout: null,
    state: 'offline',
    retry: 0,

    connect() {
      const server = defaultServer();
      const name = store.get('v25-name', 'Bewoner');
      const codes = store.get('v25-codes').split(/[\s,;]+/).filter(Boolean);
      this.setState('connecting');
      let ws;
      try { ws = new WebSocket(`ws://${server}/ws`); } catch (e) { this.setState('offline'); this.later(); return; }
      this.ws = ws;
      ws.onopen = () => {
        this.retry = 0;
        ws.send(JSON.stringify({ t: 'join', id: this.id, name, codes }));
        store.set('v25-codes', '');   // codes zijn ingewisseld; de server onthoudt de rol
      };
      ws.onmessage = (ev) => {
        let m;
        try { m = JSON.parse(ev.data); } catch (e) { return; }
        switch (m.t) {
          case 'hello': this.layout = m.layout; this.setState('online'); fire('net-hello', m.layout); break;
          case 'snap': fire('net-snap', m); break;
          case 'me': this.me = m; fire('net-me', m); break;
          case 'msg': fire('net-msg', m); break;
          case 'event': fire('net-event', m); break;
          case 'shot': fire('net-shot', m); break;
          case 'turnin': fire('net-turnin', m); break;
        }
      };
      ws.onclose = (ev) => {
        this.ws = null;
        this.setState('offline');
        if (ev.code === 4000) { fire('net-msg', { text: 'Je bent op een ander apparaat ingelogd.', tone: 'bad' }); return; }
        this.later();
      };
      ws.onerror = () => { /* onclose volgt */ };
    },

    later() {
      // Opnieuw proberen: 1 s, 2 s, 4 s … max 10 s. Wifi valt op terreinen vaak even weg.
      const ms = Math.min(10000, 1000 * Math.pow(2, this.retry++));
      setTimeout(() => this.connect(), ms);
    },

    setState(s) { this.state = s; fire('net-status', { state: s }); },

    send(msg) {
      if (this.ws && this.ws.readyState === 1) { this.ws.send(JSON.stringify(msg)); return true; }
      return false;
    },

    hasRole(role) { return !role || !!(this.me && this.me.roles.includes(role)); },
    label(item) { return (this.layout && this.layout.items[item] && this.layout.items[item].label) || item; },
    roleLabel(role) { return (this.layout && this.layout.roles[role] && this.layout.roles[role].label) || role; },
  };

  V25.net = net;
})();
