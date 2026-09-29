/**
 * Placeholder for the future "is this vehicle already claimed?" check.
 *
 * Bots cannot run another bot's slash commands (e.g. /checklink), so this
 * needs direct access to the same data the other bot uses: its database,
 * an HTTP API it exposes, or a shared file. Once that's available, implement
 * the lookup here and return { claimed: true, by: '<who>' } when it's taken.
 *
 * @param {string} link
 * @returns {Promise<{ claimed: boolean, by?: string } | null>} null = check not available
 */
async function checkVehicleClaimed(link) {
  return null;
}

module.exports = { checkVehicleClaimed };
