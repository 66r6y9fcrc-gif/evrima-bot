import "dotenv/config";
import {
  Client,
  GatewayIntentBits,
  Events,
} from "discord.js";
import {
  commands,
  handleStatus,
  handleSpieler,
  handleFarbe,
  handleDinos,
  handleAnnounce,
  handleSave,
  handleHilfe,
} from "./commands.js";

// RCON-Konfiguration aus .env
const rconConfig = {
  host: process.env.RCON_HOST,
  port: Number(process.env.RCON_PORT) || 8888,
  password: process.env.RCON_PASSWORD,
  timeoutMs: Number(process.env.RCON_TIMEOUT_MS) || 8000,
};

if (!process.env.DISCORD_TOKEN || !rconConfig.host || !rconConfig.password) {
  console.error(
    "❌ Fehlende Konfiguration. Bitte .env ausfüllen (siehe .env.example)."
  );
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (c) => {
  console.log(`✅ Bot online als ${c.user.tag}`);
  c.user.setActivity("The Isle Evrima", { type: 3 }); // Watching
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const handlers = {
    status: handleStatus,
    spieler: handleSpieler,
    farbe: handleFarbe,
    dinos: handleDinos,
    announce: handleAnnounce,
    save: handleSave,
    hilfe: handleHilfe,
  };

  const handler = handlers[interaction.commandName];
  if (!handler) return;

  // hilfe braucht keine RCON-Config
  const cfg = interaction.commandName === "hilfe" ? null : rconConfig;
  try {
    await handler(interaction, cfg);
  } catch (err) {
    console.error(`Fehler in /${interaction.commandName}:`, err);
    const msg = `⚠️ Unerwarteter Fehler: ${err.message}`;
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(msg).catch(() => {});
    } else {
      await interaction.reply(msg).catch(() => {});
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
