import "dotenv/config";
import { REST, Routes } from "discord.js";
import { commands } from "./commands.js";

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

try {
  console.log(`Registriere ${commands.length} Slash-Commands...`);
  await rest.put(
    Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
    { body: commands.map((c) => c.toJSON()) }
  );
  console.log("✅ Slash-Commands registriert.");
  console.log("Jetzt mit `npm start` den Bot starten.");
} catch (err) {
  console.error("Fehler beim Registrieren:", err);
  process.exit(1);
}
