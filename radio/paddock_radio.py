#!/usr/bin/env python3
"""
Paddock -> bunkerradio koppeling (alleen standaardbibliotheek, Python 3.7+).

Zet dit bestand naast freeradical_radio.py op de bunkerradio-Pi en roep
tussen twee nummers aan:

    from paddock_radio import fetch_paddock_bulletin

    b = fetch_paddock_bulletin()
    if b:
        # Optie A: laat FreeRadical het zelf zeggen via Ollama
        tekst = maak_bulletin_met_ollama(b["prompt"])   # jouw bestaande functie
        # Optie B: lees de kant-en-klare tekst voor (geen LLM nodig)
        # tekst = b["text"]
        spreek_uit_met_piper(tekst)                       # jouw bestaande functie

fetch_paddock_bulletin() geeft None als er niets klaarstaat of de server
onbereikbaar is — de radio speelt dan gewoon door. Het haalt telkens maximaal
één bericht op; dat bericht staat daarna bij de server als "verzonden".

Testen vanaf de commandline:
    python3 paddock_radio.py              # toont het volgende bericht (en markeert het verzonden)
    python3 paddock_radio.py --server 192.168.68.116:8090
"""
import json
import os
import sys
import urllib.error
import urllib.request

# Serveradres van de paddock-server (ComputerVanTom). Kan ook via de
# omgevingsvariabele PADDOCK_SERVER, bv. PADDOCK_SERVER=192.168.68.116:8090
SERVER = os.environ.get("PADDOCK_SERVER", "computervantom.local:8090")
TOKEN = os.environ.get("PADDOCK_RADIO_TOKEN", "")   # alleen als radio.token in server/config.js gezet is
TIMEOUT = 3  # seconden; de radio mag nooit lang blijven hangen


def fetch_paddock_bulletin(server=None):
    """Volgende paddockbericht als dict {id, kind, text, prompt}, of None."""
    url = "http://%s/radio/next" % (server or SERVER)
    if TOKEN:
        url += "?token=" + urllib.request.quote(TOKEN)
    try:
        with urllib.request.urlopen(url, timeout=TIMEOUT) as r:
            if r.status == 204:
                return None
            return json.loads(r.read().decode("utf-8"))
    except (urllib.error.URLError, OSError, ValueError):
        return None   # server uit, geen netwerk, rare reactie: gewoon doorspelen


if __name__ == "__main__":
    srv = None
    if "--server" in sys.argv:
        srv = sys.argv[sys.argv.index("--server") + 1]
    b = fetch_paddock_bulletin(srv)
    if not b:
        print("Geen bericht (of server niet bereikbaar op %s)." % (srv or SERVER))
    else:
        print("Soort :", b["kind"])
        print("Tekst :", b["text"])
        print("Prompt:", b["prompt"])
