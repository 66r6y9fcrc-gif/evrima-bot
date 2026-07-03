# 🦖 Evrima Discord Bot

Discord-Bot für **The Isle Evrima**, der per RCON mit deinem Server spricht.
Läuft dauerhaft auf einem **Raspberry Pi 3** (Pi OS Lite 64-bit).

## Was kann er

| Befehl | Funktion | Braucht Mod? |
|---|---|---|
| `/status` | Spielerliste + Server-Details | nein |
| `/spieler <steamid>` | Dino-Daten eines Spielers (Klasse, Growth, HP, Position) | nein |
| `/dinos <steamid>` | Dino-Liste eines Spielers | **Extended RCON** |
| `/farbe <steamid> <region> <farbe>` | Dino-Farbe setzen | **Dino-Colour-Command** |
| `/announce <text>` | Server-Ankündigung | nein |
| `/save` | Server-Save erzwingen | nein |
| `/hilfe` | Übersicht | – |

„Prime Elder"-Status auslesen geht nur, wenn dein Server eine Erweiterung hat, die das per RCON oder in den Server-Logs/Savefiles bereitstellt (z. B. Extended RCON). Standard-Evrima liefert das nicht.

---

## 1. Voraussetzungen am Evrima-Server

In der `Game.ini` (Pfad: `TheIsle/Saved/Config/LinuxServer/Game.ini` bzw. `WindowsServer`):

```ini
[/Script/TheIsle.TIGameSession]
bRconEnabled=true
RconPassword=dein_starkes_passwort
RconPort=8888
```

Anschließend RCON-Port **8888 (TCP)** im Server-Panel/Router freigeben und Server neu starten.

> Hinweis: Evrima nutzt ein **eigenes RCON-Protokoll**, nicht Standard-Source-RCON. Der Bot spricht genau dieses Protokoll direkt.

---

## 2. Discord-Bot anlegen

1. Gehe auf https://discord.com/developers/applications
2. **New Application** → Name z. B. „Evrima Bot"
3. Tab **Bot** → **Reset Token** → Token kopieren (nur einmal sichtbar)
4. Unter demselben Tab: **Privileged Gateway Intents** → nichts zwingend nötig (nur Guilds-Intent, schon aktiv)
5. **Application ID** (Tab *General Information*) kopieren = `DISCORD_CLIENT_ID`
6. Tab **OAuth2 → URL Generator**: Scope `bot`, Rechte z. B. `Send Messages`, `Embed Links`, `Use Slash Commands`. URL öffnen, Bot in deinen Server einladen.

---

## 3. Auf dem Raspberry Pi installieren

```bash
# 1. Node.js installieren (Pi OS 64-bit empfohlen)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. Projektordner anlegen und Code reinlegen
mkdir -p ~/evrima-bot
cd ~/evrima-bot
# (Hier die Dateien aus diesem Projekt hineinkopieren)

# 3. Abhängigkeiten installieren
npm install

# 4. Konfiguration anlegen
cp .env.example .env
nano .env   # Token, Client-ID, RCON-Daten eintragen

# 5. Slash-Commands einmalig registrieren
npm run register

# 6. Testen
npm start
```

Wenn der Bot online ist und `/hilfe` reagiert → weiter mit Autostart.

---

## 4. Autostart per systemd (läuft nach Neustart automatisch)

```bash
# Service-Datei installieren
sudo cp evrima-bot.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable evrima-bot
sudo systemctl start evrima-bot

# Status / Logs prüfen
sudo systemctl status evrima-bot
sudo journalctl -u evrima-bot -f
```

Stoppen/Neustarten:
```bash
sudo systemctl restart evrima-bot
sudo systemctl stop evrima-bot
```

---

## 5. SD-Karte schonen (wichtig beim Pi 3)

- Logs laufen ins Journal (`journalctl`), nicht in Dateien → siehe Service-Datei.
- Optional: `sudo nano /etc/systemd/journald.conf` → `SystemMaxUse=100M` setzen, dann `sudo systemctl restart systemd-journald`.

---

## Projekt-Struktur

```
evrima-bot/
├── src/
│   ├── index.js        # Bot-Hauptprogramm
│   ├── commands.js     # Slash-Commands & Handler
│   ├── rcon.js         # Evrima-RCON-Protokoll-Client
│   └── register.js     # Registriert Slash-Commands
├── .env.example
├── evrima-bot.service  # systemd-Unit
├── package.json
└── README.md
```

---

## Fehlersuche

| Problem | Lösung |
|---|---|
| `RCON-Timeout` / `Connection refused` | RCON in Game.ini aktiviert? Port 8888 TCP freigegeben? Server läuft? |
| `Unbekannter RCON-Befehl` | Befehl fehlt in `OPCodes` in `rcon.js` → ergänzen |
| `/farbe` oder `/dinos` liefert Fehler | Dino-Colour-Command bzw. Extended RCON Mod nicht installiert |
| Bot startet nicht | `.env` vollständig? Token gültig? |
| Slash-Commands fehlen in Discord | `npm run register` erneut laufen lassen |

---

## Sicherheit

- Teile dein RCON-Passwort **nie**. Wer es hat, hat vollen Admin-Zugriff.
- Der Bot speichert nur die Daten in `.env`, sonst nichts.
- Steht der Pi im Heimnetz, stelle sicher, dass der RCON-Port nur ausgehend genutzt wird (der Pi verbindet sich zum Server, nicht umgekehrt) – keine Portfreigabe für eingehenden RCON-Traffic an deinem Router nötig.
