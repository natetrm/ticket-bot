require('dotenv').config();
const { REST, Routes } = require('discord.js');
const commands = require('./commands');

const { DISCORD_TOKEN, CLIENT_ID } = process.env;

(async () => {
  const rest = new REST().setToken(DISCORD_TOKEN);

  // Global commands: available in every server the bot is in
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
  console.log(`Registered ${commands.length} global commands.`);

  // Remove any old server-only copies, which would otherwise show up as duplicates
  const guilds = await rest.get(Routes.userGuilds());
  for (const guild of guilds) {
    const existing = await rest.get(Routes.applicationGuildCommands(CLIENT_ID, guild.id));
    if (existing.length) {
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, guild.id), { body: [] });
      console.log(`Removed ${existing.length} duplicate commands from ${guild.name}.`);
    }
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
