import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v9';
import { ActivityType, Client, GatewayIntentBits, Message, PresenceUpdateStatus, User } from 'discord.js';
import logger from '../lib/logger';
import { Create } from './commands/create';
import { Settings } from './commands/settings';
import { Command } from './commands/command';
import { Invite } from './commands/invite';
import { setTimeout } from 'timers/promises';
import { EPHEMERAL_REPLY_DURATION_SHORT } from './common/constant';


/**
 * This class is used to register new Triggers with the bot
 * It is currently only capable of reacting to message triggers
 * TODO: Add additional triggers like [channelJoined, guildJoined, etc.]
 */
class Bot {
    public readonly user: User | null;
    private constructor(
        public client: Client,
        commands: Command[]
    ) {
        this.user = this.client.user;
        this.client.user?.setActivity({ name: 'New World', type: ActivityType.Playing });
        this.client.on('interactionCreate', async (interaction) => {
            if (!interaction.isCommand()) {
                return;
            }
            const command = commands.find((command) => command.name === interaction.commandName);
            try {
                command ?
                    await command.execute(interaction) :
                    await interaction.reply({ ephemeral: true, content: 'Command not found.' }).
                        catch(logger.error);
            } catch (e) {
                if (!interaction) {
                    logger.error('Error occured in command ' + + ' but interaction is not available anymore');
                    return;
                }
                if (interaction.isRepliable()) {
                    await (interaction.replied ? interaction.editReply : interaction.reply)({
                        ephemeral: true,
                        content: e instanceof Error ? e.message : e?.toString?.() || 'Unknown Error'
                    }).catch(logger.error);
                    await setTimeout(EPHEMERAL_REPLY_DURATION_SHORT);
                    await interaction.deleteReply()
                        .catch(logger.error);
                }
                logger.debug('Command failed for interaction: ' + interaction.toJSON());
            }
        });
    }

    public static async init(): Promise<Bot> {
        return new Promise((resolve, reject) => {
            const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessages] });
            const token = process.env['DISCORD_CLIENT_TOKEN'];
            const clientId = process.env['DISCORD_CLIENT_ID'];
            const commands = [
                new Create(client),
                new Settings(client),
                new Invite(client),
            ];

            if (!token) {
                throw new Error('Environment variable "DISCORD_CLIENT_TOKEN" not found!');
            }
            if (!clientId) {
                throw new Error('Environment variable "DISCORD_CLIENT_ID" not found!');
            }

            client.on('error', (e) => {
                logger.error(e);
            });

            client.once('ready', () => {
                logger.info('Client ready!');
                // Register Commands once client is ready
                const rest = new REST({ version: '10' }).setToken(token);
                rest.put(
                    Routes.applicationCommands(clientId),
                    { body: commands.map((command) => command.build()) }
                )
                    .then(() => logger.info('Commands Registered: ' + commands.map((command) => '/' + command.name).join(', ')))
                    .catch(logger.error);
            });

            client.login(token)
                .then(() => new Bot(client, commands))
                .then(resolve)
                .catch(reject);
        });
    }
}
export default Bot;