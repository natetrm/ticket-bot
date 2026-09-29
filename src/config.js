// Global settings. Per-server settings (roles, departments, ping) are set with /setup
// and stored by guildConfig.js.
module.exports = {
  // How many recent messages /ready looks back through to find a link
  messageScanLimit: 100,

  // Defaults for a server that hasn't run /setup callsign yet
  defaultCallsignLetters: 'ABCDE',
  defaultCallsignDigits: 3,
};
