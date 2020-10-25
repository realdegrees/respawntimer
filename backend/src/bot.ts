import { Client } from 'discord.js';
import { Trigger } from './common/types';

/**
 * This singleton instance is used to register new Triggers with the bot
 * It is currently only capable of reacting to message triggers
 * TODO: Add additional triggers like [channelJoined, guildJoined, etc.]
 */
class Bot {
    public constructor(private client: Client = new Client()) { }
    public init(): Promise<string> {
        return this.client.login(process.env.DISCORD_CLIENT_TOKEN);
    }
    private useTrigger(trigger: Trigger): void {
        this.client.on('message', (message) => {
            if (message.author.bot) {
                return;
            }

            // Runs a permision check on the trigger
            // If successful, run the reaction
            // If not, send the reason as a message
            trigger.check(message)
                .then(() => trigger.reaction.run(message))
                .catch((reason) => {
                    if (reason) {
                        message.channel.send(reason);
                    }
                });
        });
    }

    public use(triggers: Trigger[]): void {
        triggers.forEach(this.useTrigger.bind(this));
    }

}
export default new Bot();