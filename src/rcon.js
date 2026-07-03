import net from "node:net";

/**
 * EvrimaRcon - Client für das EIGENE RCON-Protokoll von The Isle Evrima.
 *
 * WICHTIG: Evrima nutzt NICHT das Source-RCON-Protokoll und hat KEINEN
 * Längen-Präfix. Pakete sind rohe, NUL-terminierte Byte-Strings:
 *
 *   Auth:     0x01 + Passwort + 0x00
 *   Command:  0x02 + Opcode-Byte + Params + 0x00
 *   Response: roher ASCII-String (oft mit führendem Typ-Byte + NUL am Ende)
 *
 * Referenz-Implementierung: smultar-dev/evrima.rcon (TypeScript).
 */
export class EvrimaRcon {
  constructor({ host, port, password, timeoutMs = 8000 }) {
    this.host = host;
    this.port = port;
    this.password = password;
    this.timeoutMs = timeoutMs;
    this.socket = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      socket.setTimeout(this.timeoutMs);
      let done = false;

      const fail = (err) => {
        if (done) return;
        done = true;
        try { socket.destroy(); } catch {}
        reject(err);
      };

      socket.on("error", (err) => fail(err));
      socket.on("timeout", () => fail(new Error("RCON-Timeout (Verbindung/Idle)")));
      socket.on("close", () => {
        if (!done) fail(new Error("RCON-Verbindung geschlossen (Login fehlgeschlagen?)"));
      });

      socket.connect(this.port, this.host, async () => {
        if (done) return;
        this.socket = socket;
        try {
          // Auth-Paket: 0x01 + Passwort + 0x00 (ohne Längen-Präfix!)
          await this._transmit(
            Buffer.concat([
              Buffer.from([0x01]),
              Buffer.from(this.password, "utf8"),
              Buffer.from([0x00]),
            ])
          );
          const authResp = await this._read();
          // Evrima antwortet auf erfolgreiches Login mit "Password Accepted"
          if (!authResp.toLowerCase().includes("password accepted")) {
            throw new Error("RCON-Login fehlgeschlagen (Passwort falsch?)");
          }
          if (done) return;
          done = true;
          resolve();
        } catch (err) {
          fail(err);
        }
      });
    });
  }

  async send(opcode, params = "") {
    const opByte =
      typeof opcode === "number"
        ? opcode
        : OPCodes[typeof opcode === "string" ? opcode.toLowerCase() : ""];
    if (opByte === undefined) {
      throw new Error(`Unbekannter RCON-Befehl: ${opcode}`);
    }

    // Command-Paket: 0x02 + Opcode + Params + 0x00 (ohne Längen-Präfix!)
    const packet = Buffer.concat([
      Buffer.from([0x02, opByte]),
      Buffer.from(params, "utf8"),
      Buffer.from([0x00]),
    ]);

    await this._transmit(packet);
    const resp = await this._read();
    return cleanResponse(resp);
  }

  _transmit(packet) {
    return new Promise((resolve, reject) => {
      if (!this.socket) return reject(new Error("Keine RCON-Verbindung"));
      this.socket.write(packet, (err) => (err ? reject(err) : resolve()));
    });
  }

  _read() {
    // Liest den nächsten Daten-Chunk vom Socket (Evrima schickt kleine Pakete,
    // in der Regel genau ein Chunk pro Antwort).
    return new Promise((resolve, reject) => {
      if (!this.socket) return reject(new Error("Keine RCON-Verbindung"));
      const onData = (chunk) => {
        cleanup();
        resolve(chunk.toString("utf8"));
      };
      const onError = (err) => {
        cleanup();
        reject(err);
      };
      const cleanup = () => {
        this.socket?.removeListener("data", onData);
        this.socket?.removeListener("error", onError);
      };
      this.socket.once("data", onData);
      this.socket.once("error", onError);
    });
  }

  close() {
    if (this.socket) {
      try { this.socket.destroy(); } catch {}
      this.socket = null;
    }
  }
}

/**
 * Echte Evrima-Opcode-Bytes.
 * Quelle: smultar-dev/evrima.rcon Command-Map.
 */
export const OPCodes = {
  // Server
  announce: 0x10,
  dm: 0x11, // directmessage
  serverdetails: 0x12, // srv:details
  wipecorpses: 0x13,
  updateplayables: 0x15,
  // Spieler
  ban: 0x20,
  kick: 0x30,
  playerlist: 0x40, // players
  save: 0x50,
  custom: 0x70, // für Extended-RCON-Befehle
  getplayerdata: 0x77, // playData
  // Whitelist
  togglewhitelist: 0x81,
  addwhitelist: 0x82,
  removewhitelist: 0x83,
  // Toggles
  toggleglobalchat: 0x84,
  togglehumans: 0x86,
  toggleai: 0x90,
  // Extended RCON (gameservershub Mod) - laufen über 'custom' (0x70)
  // als roher Befehlsstring, z.B. "ListPlayerDinos <steamid>"
  listplayerdinos: 0x70,
  setdinocolor: 0x70,
};

/**
 * Hilfs-Wrapper: einmalige Verbindung pro Befehl, automatisch geschlossen.
 */
export async function runRconCommand(config, opcode, params = "") {
  const rcon = new EvrimaRcon(config);
  const hardTimeoutMs = config.hardTimeoutMs ?? 15000;
  let timer;
  try {
    const result = await Promise.race([
      (async () => {
        await rcon.connect();
        return await rcon.send(opcode, params);
      })(),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`RCON hart Timeout nach ${hardTimeoutMs}ms`)),
          hardTimeoutMs
        );
      }),
    ]);
    return result;
  } finally {
    if (timer) clearTimeout(timer);
    rcon.close();
  }
}

// Antwort aufräumen: führende Typ-Bytes (0x00-0x04) und NULs entfernen
function cleanResponse(str) {
  if (!str) return "";
  return str
    .replace(/\x00+$/g, "")   // trailing NUL(s)
    .replace(/^[\x00-\x04]+/, "") // führende Steuer-Bytes
    .trim();
}
