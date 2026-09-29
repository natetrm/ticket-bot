const fs = require('fs');
const path = require('path');

// Stickies are saved to disk so they survive a bot restart.
// channelId -> { messageId, payload }
const STORE_PATH = path.join(__dirname, '..', 'stickies.json');
const REPOST_DELAY_MS = 2000; // wait for chat to settle so we don't repost on every message

const stickies = new Map(loadStore());
const timers = new Map();

function loadStore() {
  try {
    return Object.entries(JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')));
  } catch {
    return [];
  }
}

function saveStore() {
  fs.writeFileSync(STORE_PATH, JSON.stringify(Object.fromEntries(stickies), null, 2));
}

// Reposts should not ping again
function silent(payload) {
  return { ...payload, allowedMentions: { parse: [] } };
}

async function deleteOld(channel, messageId) {
  if (!messageId) return;
  await channel.messages.delete(messageId).catch(() => {});
}

/** Post a new sticky (with ping), replacing any existing sticky in the channel. */
async function setSticky(channel, payload) {
  clearTimeout(timers.get(channel.id));
  await deleteOld(channel, stickies.get(channel.id)?.messageId);

  const sent = await channel.send(payload);
  // Store the embed as plain JSON so it can be saved and resent
  stickies.set(channel.id, {
    messageId: sent.id,
    payload: {
      content: payload.content,
      embeds: payload.embeds.map((e) => (e.toJSON ? e.toJSON() : e)),
    },
  });
  saveStore();
  return sent;
}

async function removeSticky(channel) {
  const sticky = stickies.get(channel.id);
  if (!sticky) return false;
  clearTimeout(timers.get(channel.id));
  stickies.delete(channel.id);
  saveStore();
  await deleteOld(channel, sticky.messageId);
  return true;
}

/** Call on every message; moves the sticky back to the bottom after a short pause. */
function handleMessage(message) {
  const channel = message.channel;
  if (!stickies.has(channel.id)) return;
  if (message.author.id === message.client.user.id) return;

  clearTimeout(timers.get(channel.id));
  timers.set(
    channel.id,
    setTimeout(async () => {
      timers.delete(channel.id);
      const sticky = stickies.get(channel.id);
      if (!sticky) return;
      try {
        await deleteOld(channel, sticky.messageId);
        const sent = await channel.send(silent(sticky.payload));
        sticky.messageId = sent.id;
        saveStore();
      } catch (err) {
        console.error(`Failed to repost sticky in ${channel.id}:`, err.message);
      }
    }, REPOST_DELAY_MS),
  );
}

function forgetChannel(channelId) {
  clearTimeout(timers.get(channelId));
  if (stickies.delete(channelId)) saveStore();
}

module.exports = { setSticky, removeSticky, handleMessage, forgetChannel };
