require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const config = require('./config');
const { checkVehicleClaimed } = require('./vehicleCheck');
const sticky = require('./sticky');
const { getConfig } = require('./guildConfig');
const { handleSetup, formatPing } = require('./setup');

const LINK_REGEX = /https?:\/\/[^\s<>]+/gi;

const REQUIRED_CHANNEL_PERMISSIONS = {
  'View Channel': PermissionFlagsBits.ViewChannel,
  'Send Messages': PermissionFlagsBits.SendMessages,
  'Embed Links': PermissionFlagsBits.EmbedLinks,
  'Read Message History': PermissionFlagsBits.ReadMessageHistory,
};

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // must also be enabled in the Developer Portal
  ],
});

function lastLinkIn(message) {
  const links = message.content.match(LINK_REGEX);
  return links ? links[links.length - 1] : null;
}

// Matches e.g. E-123, d - 456, C123 anywhere in the nickname, using the server's format
function getCallsign(member, cfg) {
  const regex = new RegExp(`\\b([${cfg.callsignLetters}])\\s*-?\\s*(\\d{${cfg.callsignDigits}})\\b`, 'i');
  const match = member.displayName.match(regex);
  return match ? `${match[1].toUpperCase()}-${match[2]}` : null;
}

function getDepartments(member, cfg) {
  return Object.entries(cfg.departments)
    .filter(([roleId]) => member.roles.cache.has(roleId))
    .map(([, name]) => name);
}

// Newest non-bot message with a link, optionally only from one user
async function findLatestLink(channel, userId) {
  const messages = await channel.messages.fetch({ limit: config.messageScanLimit });
  for (const msg of messages.values()) {
    // fetch() returns newest first
    if (msg.author.bot) continue;
    if (userId && msg.author.id !== userId) continue;
    const link = lastLinkIn(msg);
    if (link) return { link, message: msg };
  }
  return null;
}

async function buildTicket(guild, cfg, userId, link) {
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return { error: 'Could not find that member in this server.' };

  const callsign = getCallsign(member, cfg);
  const departments = getDepartments(member, cfg);
  const claim = await checkVehicleClaimed(link);

  const embed = new EmbedBuilder()
    .setTitle('Vehicle Ticket Ready')
    .setColor(claim?.claimed ? 0xe74c3c : 0x2ecc71)
    .addFields(
      { name: 'Member', value: `${member}`, inline: true },
      { name: 'Callsign', value: callsign ?? '⚠️ Not found in nickname', inline: true },
      { name: 'Department', value: departments.length ? departments.join(', ') : '⚠️ None', inline: true },
      { name: 'Link', value: link },
    )
    .setTimestamp();

  if (claim) {
    embed.addFields({
      name: 'Claim Check',
      value: claim.claimed ? `❌ Already claimed${claim.by ? ` by ${claim.by}` : ''}` : '✅ Not claimed',
    });
  }

  const payload = { embeds: [embed], allowedMentions: { parse: [] } };
  if (cfg.pingId) {
    payload.content = formatPing(cfg);
    payload.allowedMentions =
      cfg.pingType === 'role' ? { roles: [cfg.pingId] } : { users: [cfg.pingId] };
  }
  return { payload };
}

client.once('clientReady', (c) => console.log(`Logged in as ${c.user.tag}`));

client.on('messageCreate', (message) => sticky.handleMessage(message));
client.on('channelDelete', (channel) => sticky.forgetChannel(channel.id));

client.on('interactionCreate', async (interaction) => {
  if (!interaction.inGuild()) return;

  // Discord only shows /setup to members with Manage Server
  if (interaction.isChatInputCommand() && interaction.commandName === 'setup') {
    return handleSetup(interaction).catch((err) => console.error(err));
  }

  const isReady = interaction.isChatInputCommand() && interaction.commandName === 'ready';
  const isUnsticky = interaction.isChatInputCommand() && interaction.commandName === 'unsticky';
  const isContext = interaction.isMessageContextMenuCommand() && interaction.commandName === 'Ready Ticket';
  if (!isReady && !isUnsticky && !isContext) return;

  const cfg = getConfig(interaction.guildId);
  if (!cfg.staffRoleId) {
    return interaction.reply({
      content: 'This bot has not been set up yet. A server admin needs to run `/setup` first.',
      flags: MessageFlags.Ephemeral,
    });
  }

  if (!interaction.member.roles.cache.has(cfg.staffRoleId)) {
    return interaction.reply({
      content: 'You do not have permission to use this command.',
      flags: MessageFlags.Ephemeral,
    });
  }

  if (isUnsticky) {
    const removed = await sticky.removeSticky(interaction.channel);
    return interaction.reply({
      content: removed ? 'Sticky removed.' : 'There is no sticky in this channel.',
      flags: MessageFlags.Ephemeral,
    });
  }

  // Ticket channels are often private; slash commands still work there even if the bot can't see the channel
  const missing = Object.entries(REQUIRED_CHANNEL_PERMISSIONS)
    .filter(([, flag]) => !interaction.appPermissions?.has(flag))
    .map(([name]) => name);
  if (missing.length) {
    return interaction.reply({
      content:
        `I can't work in this channel. I'm missing: **${missing.join(', ')}**.\n` +
        'Give my role access to this channel, or better, to your ticket category or your ticket bot\'s staff roles so every new ticket includes me.',
      flags: MessageFlags.Ephemeral,
    });
  }

  // Errors stay private to the staff member; the ticket itself is posted as a new
  // message, because mentions added by editing a reply don't send a notification.
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    let link;
    let userId;

    if (isContext) {
      const msg = interaction.targetMessage;
      link = lastLinkIn(msg);
      userId = msg.author.id;
      if (!link) return interaction.editReply('That message does not contain a link.');
    } else {
      const optionUser = interaction.options.getUser('member');
      const optionLink = interaction.options.getString('link');

      if (optionLink) {
        link = optionLink.match(LINK_REGEX)?.[0];
        if (!link) return interaction.editReply('That does not look like a valid link.');
        userId = optionUser?.id;
        if (!userId) {
          // No member given: attribute the ticket to whoever posted the latest link
          const found = await findLatestLink(interaction.channel);
          userId = found?.message.author.id;
        }
        if (!userId) return interaction.editReply('Please also provide the `member` option.');
      } else {
        const found = await findLatestLink(interaction.channel, optionUser?.id);
        if (!found) {
          return interaction.editReply(
            `No link found in the last ${config.messageScanLimit} messages` +
              (optionUser ? ` from ${optionUser}.` : '.'),
          );
        }
        link = found.link;
        userId = optionUser?.id ?? found.message.author.id;
      }
    }

    const result = await buildTicket(interaction.guild, cfg, userId, link);
    if (result.error) return interaction.editReply(result.error);
    await sticky.setSticky(interaction.channel, result.payload);
    await interaction.editReply('Ticket posted.');
  } catch (err) {
    console.error(err);
    await interaction.editReply('Something went wrong while organizing this ticket.').catch(() => {});
  }
});

client.login(process.env.DISCORD_TOKEN);
