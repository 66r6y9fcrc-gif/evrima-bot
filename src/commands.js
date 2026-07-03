import {
  SlashCommandBuilder,
  EmbedBuilder,
} from "discord.js";
import { runRconCommand } from "./rcon.js";

/**
 * Slash-Commands. Jeder Befehl baut eine kurze RCON-Verbindung auf,
 * fragt die Daten ab und schickt die Antwort als Embed zurück.
 */

export const commands = [
  new SlashCommandBuilder()
    .setName("status")
    .setDescription("Zeigt Server-Status und Spielerliste an"),

  new SlashCommandBuilder()
    .setName("spieler")
    .setDescription("Zeigt Dino-Daten eines Spielers an (Klasse, Growth, HP, Position)")
    .addStringOption((o) =>
      o
        .setName("steamid")
        .setDescription("SteamID64 des Spielers (17-stellig, beginnt mit 7656)")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("farbe")
    .setDescription("Setzt die Dino-Farbe (benötigt Dino-Colour-Command Mod)")
    .addStringOption((o) =>
      o.setName("steamid").setDescription("SteamID64").setRequired(true)
    )
    .addStringOption((o) =>
      o
        .setName("region")
        .setDescription("Farbregion 0-5")
        .setRequired(true)
        .addChoices(
          { name: "Region 0", value: "0" },
          { name: "Region 1", value: "1" },
          { name: "Region 2", value: "2" },
          { name: "Region 3", value: "3" },
          { name: "Region 4", value: "4" },
          { name: "Region 5", value: "5" }
        )
    )
    .addStringOption((o) =>
      o
        .setName("farbe")
        .setDescription("Farb-Name oder Hex-Code, z.B. 'red' oder '#ff0000'")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("dinos")
    .setDescription("Listet die Dinos eines Spielers auf (Extended RCON Mod)")
    .addStringOption((o) =>
      o.setName("steamid").setDescription("SteamID64").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("announce")
    .setDescription("Sendet eine Server-Ankündigung an alle Spieler")
    .addStringOption((o) =>
      o.setName("text").setDescription("Nachricht").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("save")
    .setDescription("Erzwingt ein Server-Save"),

  new SlashCommandBuilder()
    .setName("hilfe")
    .setDescription("Zeigt alle Befehle und Setup-Infos"),
];

export async function handleStatus(interaction, cfg) {
  await interaction.deferReply();
  try {
    const [players, details] = await Promise.all([
      runRconCommand(cfg, "playerlist").catch(() => "—"),
      runRconCommand(cfg, "serverdetails").catch(() => "—"),
    ]);
    const embed = new EmbedBuilder()
     .setTitle("🦖 Evrima-Server Status")
      .setColor(0x2ecc71)
      .addFields(
        { name: "Spieler online", value: truncate(players, 1024), inline: false },
        { name: "Server-Details", value: truncate(details, 1024), inline: false }
      )
      .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    await errorReply(interaction, err);
  }
}

export async function handleSpieler(interaction, cfg) {
  await interaction.deferReply();
  const steamid = interaction.options.getString("steamid");
  try {
    const data = await runRconCommand(cfg, "getplayerdata", steamid);
    const embed = new EmbedBuilder()
      .setTitle(`👤 Spieler ${steamid}`)
      .setColor(0x3498db)
      .setDescription(truncate(data, 4096) || "Keine Daten erhalten.")
      .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    await errorReply(interaction, err);
  }
}

export async function handleFarbe(interaction, cfg) {
  await interaction.deferReply();
  const steamid = interaction.options.getString("steamid");
  const region = interaction.options.getString("region");
  const farbe = interaction.options.getString("farbe");
  try {
    // Dino-Colour-Command Mod (custom-Befehl). Syntax hängt von der Mod ab,
    // typisch: "SetDinoColor <steamid> <region> <color>"
    const res = await runRconCommand(cfg, "setdinocolor", `SetDinoColor ${steamid} ${region} ${farbe}`);
    const embed = new EmbedBuilder()
      .setTitle("🎨 Dino-Farbe gesetzt")
      .setColor(0xe67e22)
      .addFields(
        { name: "Spieler", value: steamid, inline: true },
        { name: "Region", value: region, inline: true },
        { name: "Farbe", value: farbe, inline: true },
        { name: "Server-Antwort", value: truncate(res || "OK", 1024), inline: false }
      )
      .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    await errorReply(interaction, err);
  }
}

export async function handleDinos(interaction, cfg) {
  await interaction.deferReply();
  const steamid = interaction.options.getString("steamid");
  try {
    // Extended RCON 'custom'-Befehl: "ListPlayerDinos <steamid>"
    const res = await runRconCommand(cfg, "listplayerdinos", `ListPlayerDinos ${steamid}`);
    const embed = new EmbedBuilder()
      .setTitle(`🦕 Dinos von ${steamid}`)
      .setColor(0x9b59b6)
      .setDescription(truncate(res, 4096) || "Keine Dinos gefunden.")
      .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    await errorReply(interaction, err);
  }
}

export async function handleAnnounce(interaction, cfg) {
  await interaction.deferReply();
  const text = interaction.options.getString("text");
  try {
    const res = await runRconCommand(cfg, "announce", text);
    await interaction.editReply(`✅ Ankündigung gesendet.\n${res ? `\`\`\`${res}\`\`\`` : ""}`);
  } catch (err) {
    await errorReply(interaction, err);
  }
}

export async function handleSave(interaction, cfg) {
  await interaction.deferReply();
  try {
    const res = await runRconCommand(cfg, "save");
    await interaction.editReply(`✅ Save ausgeführt.\n${res ? `\`\`\`${res}\`\`\`` : ""}`);
  } catch (err) {
    await errorReply(interaction, err);
  }
}

export async function handleHilfe(interaction) {
  const embed = new EmbedBuilder()
    .setTitle("📖 Evrima-Bot Hilfe")
    .setColor(0x1abc9c)
    .setDescription(
      [
        "**Befehle:**",
        "`/status` – Spieler & Server-Details",
        "`/spieler <steamid>` – Dino-Daten eines Spielers",
        "`/dinos <steamid>` – Dino-Liste (Extended RCON)",
        "`/farbe <steamid> <region> <farbe>` – Dino-Farbe (Dino-Colour Mod)",
        "`/announce <text>` – Server-Ankündigung",
        "`/save` – Server-Save erzwingen",
        "",
        "**Voraussetzungen auf dem Evrima-Server:**",
        "• RCON aktiviert (Game.ini: `bRconEnabled=true`)",
        "• Extended RCON Mod für `/dinos`",
        "• Dino-Colour-Command Mod für `/farbe`",
      ].join("\n")
    );
  await interaction.reply({ embeds: [embed] });
}

function truncate(str, max) {
  if (!str) return "—";
  return str.length > max ? str.slice(0, max - 3) + "..." : str;
}

async function errorReply(interaction, err) {
  const msg = `⚠️ RCON-Fehler: ${err.message}`;
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(msg).catch(() => {});
  } else {
    await interaction.reply(msg).catch(() => {});
  }
}
