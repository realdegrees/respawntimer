import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v9';
import { Client, GatewayIntentBits, User } from 'discord.js';
import logger from '../lib/logger';
import { CommandCreate } from './commands/create';
import { CommandSet } from './commands/set';
import { Command } from './common/command';


/**
 * This class is used to register new Triggers with the bot
 * It is currently only capable of reacting to message triggers
 * TODO: Add additional triggers like [channelJoined, guildJoined, etc.]
 */
class Bot {
    public readonly user: User | null;

    private constructor(
        private client: Client,
        commands: Command[]
    ) {
        this.user = this.client.user;
        this.client.user?.setActivity({name: '/create'});
        this.client.on('interactionCreate', (interaction) => {
            if (!interaction.isCommand()) return;
            commands.find((command) => command.name === interaction.commandName)?.execute(interaction);
        });
    }

    public static async init(): Promise<Bot> {
        return new Promise((resolve, reject) => {
            const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });
            const token = process.env['DISCORD_CLIENT_TOKEN'];
            const clientId = process.env['DISCORD_CLIENT_ID'];
            const commands = [
                new CommandCreate(client),
                new CommandSet(client)
            ];

            if (!token) {
                throw new Error('Environment variable "DISCORD_CLIENT_TOKEN" not found!');
            }
            if (!clientId) {
                throw new Error('Environment variable "DISCORD_CLIENT_ID" not found!');
            }

            client.on('error', (e) => {
                logger.error(e);
                process.exit(1);
            });

            client.once('ready', () => {
                logger.info('Client ready!');
                // Register Commands once client is ready
                const rest = new REST({ version: '9' }).setToken(token);
                rest.put(
                    Routes.applicationCommands(clientId),
                    { body: commands.map((command) => command.build()) }
                ).then(() => {
                    logger.info(commands.length + ' commands registered!');
                });
            });

            client.login(token)
                .then(() => new Bot(client, commands))
                .then(resolve)
                .catch(reject);


        });
    }
}
export default Bot;