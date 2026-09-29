const fs = require('fs');
const path = require('path');
const config = require('./config');

// guildId -> { staffRoleId, pingId, pingType, departments: { roleId: name }, callsignLetters, callsignDigits }
const STORE_PATH = path.join(__dirname, '..', 'guilds.json');

let store = {};
try {
  store = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
} catch {
  store = {};
}

function save() {
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

function getConfig(guildId) {
  return {
    staffRoleId: null,
    pingId: null,
    pingType: null, // 'user' | 'role'
    departments: {},
    callsignLetters: config.defaultCallsignLetters,
    callsignDigits: config.defaultCallsignDigits,
    ...store[guildId],
  };
}

function updateConfig(guildId, changes) {
  store[guildId] = { ...getConfig(guildId), ...changes };
  save();
  return store[guildId];
}

function resetConfig(guildId) {
  delete store[guildId];
  save();
}

module.exports = { getConfig, updateConfig, resetConfig };
