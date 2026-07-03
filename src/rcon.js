import net from "node:net";

/**
 * EvrimaRcon - Client für das eigene RCON-Protokoll von The Isle Evrima.
 *
 * Evrima nutzt NICHT das Standard-Source-RCON-Protokoll. Paket-Format:
 *   [4 Byte Länge (little-endian int32)] [1 Byte Typ] [Payload] [0x00 NUL]
 *
 *   Auth:    Typ 0x01, Payload = Passwort
 *   Command: Typ 0x02, Payload = Opcode-Byte + Argumente (komma-separiert)
 *   Antwort: Typ 0x00 (Auth-OK) bzw. 0x01 (Command-Response)
 *
 * Referenz: butt4cak3/theislercon, isle-evrima-rcon (npm), XGamingServer Doku.
 */
export class EvrimaRcon {
  constructor({ host, port, password, timeoutMs = 5000 }) {
    this.host = host;
    this.port = port;
    this.password = password;
    this.timeoutMs = timeoutMs;
    this.socket = null;
    this._queue = [];
    this._buffer = Buffer.alloc(0);
    this._pending = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      if (this.socket && this.socket.readyState !== "closed") {
        return resolve();
      }
      const socket = new net.Socket();
      socket.setTimeout(this.timeoutMs);

      socket.on("connect", async () => {
        try {
          await this._sendAuth();
          this._drain();
          resolve();
        } catch (err) {
          this._teardown();
          reject(err);
        }
      });

      socket.on("data", (chunk) => this._onData(chunk));
      socket.on("error", (err) => {
        this._fail(err);
        reject(err);
      });
      socket.on("close", () => {
        this._fail(new Error("RCON-Verbindung geschlossen"));
      });
      socket.on("timeout", () => {
        this._fail(new Error("RCON-Timeout"));
      });

      socket.connect(this.port, this.host);
      this.socket = socket;
    });
  }

  async send(opcode, ...args) {
    // Opcode kann als String ("playerlist") oder als Zahl kommen.
    const opByte =
      typeof opcode === "number"
        ? opcode
        : OPCodes[typeof opcode === "string" ? opcode.toLowerCase() : ""];

    if (opByte === undefined) {
      throw new Error(`Unbekannter RCON-Befehl: ${opcode}`);
    }

    const payload = [Buffer.from([opByte])];
    if (args.length) {
      const argStr = args.join(",");
      payload.push(Buffer.from(argStr, "utf8"));
    }
    payload.push(Buffer.from([0x00]));

    const body = Buffer.concat(payload);
    const packet = this._frame(0x02, body);

    return this._request(packet);
  }

  _sendAuth() {
    const body = Buffer.concat([
      Buffer.from(this.password, "utf8"),
      Buffer.from([0x00]),
    ]);
    const packet = this._frame(0x01, body);
    return this._request(packet, { auth: true });
  }

  _frame(type, body) {
    const header = Buffer.alloc(4);
    header.writeInt32LE(body.length + 2, 0); // +1 Typ-Byte +1 NUL
    const typeBuf = Buffer.from([type]);
    return Buffer.concat([header, typeBuf, body]);
  }

  _request(packet, { auth = false } = {}) {
    return new Promise((resolve, reject) => {
      const job = { packet, resolve, reject, auth };
      if (this._pending) {
        this._queue.push(job);
      } else {
        this._pending = job;
        this.socket.write(packet);
      }
    });
  }

  _drain() {
    if (this._pending) return;
    const next = this._queue.shift();
    if (!next) return;
    this._pending = next;
    this.socket.write(next.packet);
  }

  _onData(chunk) {
    this._buffer = Buffer.concat([this._buffer, chunk]);

    while (this._buffer.length >= 4) {
      const length = this._buffer.readInt32LE(0);
      if (this._buffer.length < 4 + length) break; // Paket noch unvollständig

      const body = this._buffer.subarray(4, 4 + length);
      // body[0] = Typ, rest = Payload (bis NUL)
      const payload = body.subarray(1);
      const nul = payload.indexOf(0x00);
      const text =
        nul >= 0 ? payload.subarray(0, nul).toString("utf8") : payload.toString("utf8");

      this._buffer = this._buffer.subarray(4 + length);

      if (this._pending) {
        const job = this._pending;
        this._pending = null;
        job.resolve(text.trim());
        this._drain();
      }
    }
  }

  _fail(err) {
    const job = this._pending;
    this._pending = null;
    if (job) job.reject(err);
    while (this._queue.length) this._queue.shift().reject(err);
    this._teardown();
  }

  _teardown() {
    if (this.socket) {
      try {
        this.socket.destroy();
      } catch {
        /* noop */
      }
      this.socket = null;
    }
  }

  close() {
    this._teardown();
  }
}

/**
 * Bekannte Evrima-RCON-Opcodes. Strings in send() werden hierauf gemappt.
 * Quelle: XGamingServer / Game Host Bros Kommando-Referenz.
 */
export const OPCodes = {
  // Info
  playerlist: 0,
  getplayerdata: 1,
  serverdetails: 2,
  getqueuestatus: 3,
  getplayables: 4,
  // Moderation
  announce: 10,
  kick: 11,
  ban: 12,
  directmessage: 13,
  slay: 14,
  // Whitelist
  addwhitelist: 20,
  removewhitelist: 21,
  togglewhitelist: 22,
  // Server
  save: 30,
  pause: 31,
  toggleglobalchat: 32,
  toggleai: 33,
  wipecorpses: 34,
  setgrowthmultiplier: 35,
  updateplayables: 36,
  // Extended RCON (Mod von gameservershub.com - nur installiert)
  listplayerdinos: 100,
  adddinoexperience: 101,
  setdinocolor: 102, // Dino-Colour-Command Mod
};

/**
 * Hilfs-Wrapper: einmalige Verbindung pro Befehl, automatisch geschlossen.
 * Einfacher zu benutzen als eine dauerhafte Verbindung, ideal für einen Bot.
 */
export async function runRconCommand(config, opcode, ...args) {
  const rcon = new EvrimaRcon(config);
  const hardTimeoutMs = (config.hardTimeoutMs ?? 15000);
  let timer;
  try {
    const result = await Promise.race([
      (async () => {
        await rcon.connect();
        return await rcon.send(opcode, ...args);
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
