import { Client, User } from 'discord.js';
import Firebase from '../lib/firebase';
import logger from '../lib/logger';
import { CommandAborted } from './common/errors/command-aborted';
import { InternalError } from './common/errors/internal.error';
import { NoMatchError } from './common/errors/no-match.error';
import { VerboseError } from './common/errors/verbose.error';
import { Trigger } from './common/types';
import { GuildHelper } from './helpers/guild.helper';


/**
 * This class is used to register new Triggers with the bot
 * It is currently only capable of reacting to message triggers
 * TODO: Add additional triggers like [channelJoined, guildJoined, etc.]
 */
class Bot {
    public readonly guildHelper: GuildHelper;
    public readonly user: User | null;
    private readonly triggers: Trigger[] = [];
    private constructor(
        private client: Client,
        private db: Firebase
    ) {
        this.guildHelper = new GuildHelper(this.client);
        this.user = this.client.user;
    }

    public static async init(db: Firebase): Promise<Bot> {
        return new Promise((resolve, reject) => {
            const client = new Client();
            const discordToken = process.env['DISCORD_CLIENT_TOKEN'];

            if (!discordToken) {
                throw new Error('Environment variable "DISCORD_CLIENT_TOKEN" not found!');
            }

            client.on('error', (e) => {
                logger.error(e);
                process.exit(1);
            });

            client.login(discordToken)
                .then(() => new Bot(client, db))
                .then(resolve)
                .catch(reject);
        });
    }
    private useTrigger(trigger: Trigger): void {
        // ! This reflection must be the first expression when registering a trigger!
        Reflect.set(trigger, 'bot', this);
        // ! This reflection must be the first expression when registering a trigger!
        Reflect.set(trigger, 'db', this.db);

        this.triggers.push(trigger);

        this.client.on('message', (message) => {
            if (message.author.bot) {
                return;
            }

            // Runs a permision check on the trigger
            // If successful, run the reaction
            // If not, send the reason as a message
            trigger.check(message)
                .then((message) => trigger.message(message))
                .catch((reason: Error | string) => {
                    if (reason instanceof NoMatchError) {
                        return;
                    } else if (reason instanceof InternalError) {
                        logger.error(reason);
                        message.channel.send('An internal error occured!');
                    } else if (reason instanceof VerboseError) {
                        message.channel.send(reason.message);
                    } else if (!(reason instanceof CommandAborted)) {
                        // ! Critical Error
                        logger.error(reason);
                    }
                });
        });
        this.client.on('messageReactionAdd', (reaction, user) => {
            trigger.reaction(reaction, user)
                .catch(logger.error);
        });
    }

    public use(triggers: Trigger[]): void {
        triggers.forEach(this.useTrigger.bind(this));
    }

    public getTriggers(): Trigger[] {
        return this.triggers;
    }

}
export default Bot;