const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MentionableSelectMenuBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  RoleSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const { getConfig, updateConfig } = require('./guildConfig');

const STEPS = ['staff', 'ping', 'departments', 'callsign', 'review'];
const WIZARD_TIMEOUT_MS = 15 * 60 * 1000;
const MODAL_TIMEOUT_MS = 5 * 60 * 1000;
const NAMES_PER_MODAL = 5; // Discord allows at most 5 inputs per modal

function formatPing(cfg) {
  if (!cfg.pingId) return null;
  return cfg.pingType === 'role' ? `<@&${cfg.pingId}>` : `<@${cfg.pingId}>`;
}

function departmentList(cfg) {
  return (
    Object.entries(cfg.departments)
      .map(([roleId, name]) => `<@&${roleId}> → **${name}**`)
      .join('\n') || 'None'
  );
}

function callsignExample(cfg) {
  return `${cfg.callsignLetters[0]}-${'1'.repeat(cfg.callsignDigits)}`;
}

function summaryFields(cfg) {
  return [
    { name: 'Staff role', value: cfg.staffRoleId ? `<@&${cfg.staffRoleId}>` : '⚠️ Not set', inline: true },
    { name: 'Ping', value: formatPing(cfg) ?? 'Nobody', inline: true },
    { name: 'Callsign format', value: `Letters \`${cfg.callsignLetters}\`, ${cfg.callsignDigits} digits (e.g. ${callsignExample(cfg)})` },
    { name: 'Departments', value: departmentList(cfg) },
  ];
}

const button = (id, label, style = ButtonStyle.Secondary, disabled = false) =>
  new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style).setDisabled(disabled);

const row = (...components) => new ActionRowBuilder().addComponents(...components);

function navRow(step, draft, extra = []) {
  const index = STEPS.indexOf(step);
  const buttons = [];
  if (index > 0) buttons.push(button('back', 'Back'));
  buttons.push(...extra);
  buttons.push(button('next', 'Next', ButtonStyle.Primary, step === 'staff' && !draft.staffRoleId));
  buttons.push(button('cancel', 'Cancel', ButtonStyle.Danger));
  return row(...buttons);
}

function render(step, draft, guild, notice) {
  const number = STEPS.indexOf(step) + 1;
  const embed = new EmbedBuilder().setColor(0x5865f2);
  const components = [];

  switch (step) {
    case 'staff': {
      embed
        .setTitle(`Step ${number}/${STEPS.length}: Staff role`)
        .setDescription(
          'Pick the role that can use `/ready` and `/unsticky`.\n\n' +
            `**Current:** ${draft.staffRoleId ? `<@&${draft.staffRoleId}>` : 'Not set'}`,
        );
      const select = new RoleSelectMenuBuilder().setCustomId('staff').setPlaceholder('Select the staff role');
      if (draft.staffRoleId) select.setDefaultRoles(draft.staffRoleId);
      components.push(row(select), navRow(step, draft));
      break;
    }

    case 'ping': {
      embed
        .setTitle(`Step ${number}/${STEPS.length}: Who gets pinged`)
        .setDescription(
          'Pick the user or role pinged when a ticket is ready.\n\n' +
            `**Current:** ${formatPing(draft) ?? 'Nobody'}`,
        );
      const select = new MentionableSelectMenuBuilder().setCustomId('ping').setPlaceholder('Select a user or role');
      if (draft.pingId) {
        if (draft.pingType === 'role') select.addDefaultRoles(draft.pingId);
        else select.addDefaultUsers(draft.pingId);
      }
      components.push(row(select), navRow(step, draft, [button('no-ping', "Don't ping anyone")]));
      break;
    }

    case 'departments': {
      const roleIds = Object.keys(draft.departments);
      embed
        .setTitle(`Step ${number}/${STEPS.length}: Departments`)
        .setDescription(
          'Pick every department role (e.g. RCMP, OPP, TPS). The role name is used unless you rename it.\n\n' +
            `**Departments:**\n${departmentList(draft)}`,
        );
      const select = new RoleSelectMenuBuilder()
        .setCustomId('departments')
        .setPlaceholder('Select department roles')
        .setMinValues(0)
        .setMaxValues(25);
      if (roleIds.length) select.setDefaultRoles(...roleIds);
      components.push(row(select));

      // One "Rename" button per group of 5 departments (modal limit)
      const renameButtons = [];
      for (let i = 0; i < roleIds.length; i += NAMES_PER_MODAL) {
        const label =
          roleIds.length <= NAMES_PER_MODAL ? 'Rename departments' : `Rename ${i + 1}-${Math.min(i + NAMES_PER_MODAL, roleIds.length)}`;
        renameButtons.push(button(`rename-${i / NAMES_PER_MODAL}`, label));
      }
      if (renameButtons.length) components.push(row(...renameButtons));
      components.push(navRow(step, draft));
      break;
    }

    case 'callsign': {
      embed
        .setTitle(`Step ${number}/${STEPS.length}: Callsign format`)
        .setDescription(
          'The bot reads the callsign from the member\'s nickname.\n\n' +
            `**Current:** a letter from \`${draft.callsignLetters}\` followed by ${draft.callsignDigits} digits ` +
            `(e.g. ${callsignExample(draft)})`,
        );
      components.push(navRow(step, draft, [button('callsign-edit', 'Change format')]));
      break;
    }

    case 'review': {
      embed
        .setTitle(`Step ${number}/${STEPS.length}: Review`)
        .setDescription('Check everything, then press **Save**.')
        .addFields(summaryFields(draft));
      components.push(
        row(button('back', 'Back'), button('save', 'Save', ButtonStyle.Success), button('cancel', 'Cancel', ButtonStyle.Danger)),
      );
      break;
    }
  }

  return { content: notice ?? '', embeds: [embed], components, allowedMentions: { parse: [] } };
}

function namesModal(chunk, draft, guild, id) {
  const roleIds = Object.keys(draft.departments).slice(chunk * NAMES_PER_MODAL, (chunk + 1) * NAMES_PER_MODAL);
  const modal = new ModalBuilder().setCustomId(id).setTitle('Department names');
  for (const roleId of roleIds) {
    const roleName = guild.roles.cache.get(roleId)?.name ?? roleId;
    modal.addComponents(
      row(
        new TextInputBuilder()
          .setCustomId(roleId)
          .setLabel(`Name for @${roleName}`.slice(0, 45))
          .setStyle(TextInputStyle.Short)
          .setMaxLength(50)
          .setRequired(true)
          .setValue(draft.departments[roleId]),
      ),
    );
  }
  return modal;
}

function callsignModal(draft, id) {
  return new ModalBuilder()
    .setCustomId(id)
    .setTitle('Callsign format')
    .addComponents(
      row(
        new TextInputBuilder()
          .setCustomId('letters')
          .setLabel('Allowed letters (e.g. ABCDE)')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(26)
          .setRequired(true)
          .setValue(draft.callsignLetters),
      ),
      row(
        new TextInputBuilder()
          .setCustomId('digits')
          .setLabel('Number of digits (1-6), e.g. 3 for C-123')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(1)
          .setRequired(true)
          .setValue(String(draft.callsignDigits)),
      ),
    );
}

// Shows a modal and applies the submitted values; returns false if the user closed it
async function runModal(i, modal, apply) {
  await i.showModal(modal);
  const submit = await i
    .awaitModalSubmit({ filter: (m) => m.customId === modal.data.custom_id, time: MODAL_TIMEOUT_MS })
    .catch(() => null);
  if (!submit) return;
  await apply(submit);
}

async function handleSetup(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
    return interaction.reply({ content: 'You need Manage Server to run setup.', flags: MessageFlags.Ephemeral });
  }

  const guild = interaction.guild;
  const draft = structuredClone(getConfig(interaction.guildId));
  let step = 'staff';

  const response = await interaction.reply({
    ...render(step, draft, guild),
    flags: MessageFlags.Ephemeral,
    withResponse: true,
  });
  const message = response.resource.message;

  const collector = message.createMessageComponentCollector({
    filter: (i) => i.user.id === interaction.user.id,
    time: WIZARD_TIMEOUT_MS,
  });

  const show = (i, notice) => i.update(render(step, draft, guild, notice));

  collector.on('collect', async (i) => {
    try {
      switch (i.customId) {
        case 'next':
          step = STEPS[STEPS.indexOf(step) + 1];
          return show(i);
        case 'back':
          step = STEPS[STEPS.indexOf(step) - 1];
          return show(i);

        case 'staff':
          draft.staffRoleId = i.values[0];
          return show(i);

        case 'ping': {
          const role = i.roles.first();
          draft.pingId = role ? role.id : i.users.first().id;
          draft.pingType = role ? 'role' : 'user';
          return show(i);
        }
        case 'no-ping':
          draft.pingId = null;
          draft.pingType = null;
          return show(i);

        case 'departments': {
          // Keep custom names for roles that are still selected; new roles use the role name
          const departments = {};
          for (const [roleId, role] of i.roles) departments[roleId] = draft.departments[roleId] ?? role.name;
          draft.departments = departments;
          return show(i);
        }

        case 'callsign-edit':
          return runModal(i, callsignModal(draft, `callsign-${i.id}`), async (submit) => {
            const letters = [...new Set(submit.fields.getTextInputValue('letters').toUpperCase().replace(/[^A-Z]/g, ''))].join('');
            const digits = Number(submit.fields.getTextInputValue('digits'));
            if (!letters || !Number.isInteger(digits) || digits < 1 || digits > 6) {
              return submit.update(render(step, draft, guild, '⚠️ Letters must be A-Z and digits must be a number from 1 to 6.'));
            }
            draft.callsignLetters = letters;
            draft.callsignDigits = digits;
            return submit.update(render(step, draft, guild));
          });

        case 'save':
          updateConfig(interaction.guildId, draft);
          collector.stop('saved');
          return i.update({
            content: '✅ Setup saved! Staff can now use `/ready` in ticket channels. Run `/setup` again any time to change things.',
            embeds: [new EmbedBuilder().setTitle('Ticket Bot Settings').setColor(0x2ecc71).addFields(summaryFields(draft))],
            components: [],
            allowedMentions: { parse: [] },
          });

        case 'cancel':
          collector.stop('cancelled');
          return i.update({ content: 'Setup cancelled. Nothing was changed.', embeds: [], components: [] });

        default:
          if (i.customId.startsWith('rename-')) {
            const chunk = Number(i.customId.split('-')[1]);
            return runModal(i, namesModal(chunk, draft, guild, `names-${i.id}`), async (submit) => {
              const roleIds = Object.keys(draft.departments).slice(chunk * NAMES_PER_MODAL, (chunk + 1) * NAMES_PER_MODAL);
              for (const roleId of roleIds) {
                const value = submit.fields.getTextInputValue(roleId).trim();
                if (value) draft.departments[roleId] = value;
              }
              return submit.update(render(step, draft, guild));
            });
          }
      }
    } catch (err) {
      console.error('Setup wizard error:', err);
    }
  });

  collector.on('end', (_, reason) => {
    if (reason === 'time') {
      interaction
        .editReply({ content: '⌛ Setup timed out. Nothing was changed. Run `/setup` again.', embeds: [], components: [] })
        .catch(() => {});
    }
  });
}

module.exports = { handleSetup, formatPing };
