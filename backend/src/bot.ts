import { Client, Guild, GuildMember } from 'discord.js';
import Firebase from '../lib/firebase';
import logger from '../lib/logger';
import { InternalError } from './common/errors/internal.error';
import { NoMatchError } from './common/errors/no-match.error';
import { VerboseError } from './common/errors/verbose.error';
import { Trigger } from './common/types';


const defaultBotName = 'Casuals United Bot';
/**
 * This class is used to register new Triggers with the bot
 * It is currently only capable of reacting to message triggers
 * TODO: Add additional triggers like [channelJoined, guildJoined, etc.]
 */
class Bot {
    private constructor(private client: Client, private db: Firebase) {
    }
    /** 
     * @returns A function to reset the name
     */
    public changeName(name: string, guild: Guild): Promise<() => Promise<GuildMember>> {
        return new Promise((resolve, reject) => {
            if (!this.client.user) {
                reject(new InternalError('Client cannot be identified as guild member'));
                return;
            }
            const member = guild.member(this.client.user);
            if (!member) {
                reject(new InternalError('Client cannot be identified as guild member'));
                return;
            }
            member
                .setNickname(name)
                .then((member) => resolve(() => member.setNickname(defaultBotName)));
        });
    }
    public static async init(db: Firebase): Promise<Bot> {
        return new Promise((resolve, reject) => {
            const client = new Client();
            const discordToken = process.env['DISCORD_CLIENT_TOKEN'];

            if (!discordToken) {
                throw new Error('Environment variable "DISCORD_CLIENT_TOKEN" not found!');
            }

            client.login(discordToken)
                .then(() => client.on('ready', resolve))
                .then(() => new Bot(client, db))
                .then(resolve)
                .catch(reject);
        });
    }
    private useTrigger(trigger: Trigger): void {
        // ! This reflection must be the first expression when registering a trigger!
        Reflect.set(trigger, 'bot', this);
        // ! This reflection must be the first expression when registering a trigger!
        Reflect.set(trigger, 'db', this.db); +

            this.client.on('message', (message) => {
                if (message.author.bot) {
                    return;
                }

                // Runs a permision check on the trigger
                // If successful, run the reaction
                // If not, send the reason as a message
                trigger.check(message)
                    .then((message) => trigger.react(message))
                    .catch((reason: VerboseError | InternalError | NoMatchError) => {
                        if (reason instanceof NoMatchError) {
                            return;
                        }
                        if (reason instanceof InternalError) {
                            logger.error(reason);
                            message.channel.send('An internal error occured!');
                        }
                        if (reason instanceof VerboseError) {
                            message.channel.send(reason.message);
                        }
                    });
            });
    }

    public use(triggers: Trigger[]): void {
        triggers.forEach(this.useTrigger.bind(this));
    }

}
export default Bot;