import { Client } from 'discord.js';
import { Trigger } from './common/types';

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

            trigger.check(message)
                .then(() => trigger.callback(message))
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