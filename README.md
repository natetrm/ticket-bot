# Ticket Bot

Organizes FiveM personal vehicle tickets into an embed with the link, department and callsign, then pings a reviewer. Works in any server; each server sets itself up with `/setup`.

## Running the bot

1. Copy `.env.example` to `.env` and fill in `DISCORD_TOKEN` and `CLIENT_ID`.
2. In the Developer Portal, under **Bot**, turn on **Message Content Intent**.
3. Run:
   ```
   npm install
   npm run deploy   # registers commands globally (only needed again if commands change)
   npm start
   ```

Invite link (replace CLIENT_ID):
`https://discord.com/oauth2/authorize?client_id=CLIENT_ID&scope=bot+applications.commands&permissions=84992`

## Setting up a server (needs Manage Server)

Run `/setup`. A private wizard walks you through:

1. **Staff role**: who can use `/ready` and `/unsticky` (required)
2. **Ping**: user or role pinged on new tickets (optional)
3. **Departments**: pick department roles; names default to the role name and can be renamed
4. **Callsign format**: default is a letter A-E plus 3 digits (e.g. C-123)
5. **Review**: nothing changes until you press **Save**

Run `/setup` again any time; it starts with the current settings filled in. Settings are saved in `guilds.json`.

## Usage (staff role only)

- `/ready`: finds the newest message with a link in the channel and uses whoever posted it.
  - `member:` only looks at links from that user.
  - `link:` uses this link instead of searching the channel.
- Right-click a message, then **Apps → Ready Ticket**: uses that exact message.
- `/unsticky`: removes the ticket message from the channel.

The ticket message is **sticky**. When someone posts in the channel, the bot waits about 2 seconds, deletes the ticket message and posts it again at the bottom. Only the first post pings; reposts are silent. Stickies are saved in `stickies.json`.

## Future: vehicle claim check

Bots can't run other bots' slash commands, so `/checklink` can't be called directly.
Fill in `src/vehicleCheck.js` once the bot has direct access to that database (or to an API for it). The embed already shows the result.
