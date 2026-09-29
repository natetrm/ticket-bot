const {
  SlashCommandBuilder,
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  PermissionFlagsBits,
  InteractionContextType,
} = require('discord.js');

module.exports = [
  new SlashCommandBuilder()
    .setName('ready')
    .setDescription('Organize this ticket: latest link, department, and callsign')
    .setContexts(InteractionContextType.Guild)
    .addUserOption((o) =>
      o
        .setName('member')
        .setDescription('Whose ticket this is (default: whoever posted the latest link)')
        .setRequired(false),
    )
    .addStringOption((o) =>
      o
        .setName('link')
        .setDescription('Use this link instead of searching the channel')
        .setRequired(false),
    ),

  new SlashCommandBuilder()
    .setName('unsticky')
    .setDescription('Remove the sticky ticket message from this channel')
    .setContexts(InteractionContextType.Guild),

  new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configure the ticket bot for this server')
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  // Right-click a message -> Apps -> "Ready Ticket" to use that exact message's link
  new ContextMenuCommandBuilder()
    .setName('Ready Ticket')
    .setType(ApplicationCommandType.Message)
    .setContexts(InteractionContextType.Guild),
].map((c) => c.toJSON());
