import { Client } from 'discord.js';
import { Trigger } from './common/types';
import { dynamicConfig } from './common/dynamic-config';



class Bot {
    public constructor(private client: Client = new Client()) { }
    public start(): void {
        this.client.login(process.env.DISCORD_CLIENT_TOKEN);
    }
    // Commands as middleware
    public use(trigger: Trigger): void {
        this.client.on('message', (message) => {
            if (message.author.bot) {
                return;
            }
            trigger.checkCondition(message)
                .then(async (conditionPassed) =>
                    [
                        conditionPassed,
                        await trigger.checkPermission(message.member)
                    ] as const)
                .then(([conditionPassed, hasPermission]) => {
                    if (conditionPassed && hasPermission) {
                        trigger.callback(message);
                    } else if (!hasPermission) {
                        message.channel.send(dynamicConfig.permissionDeniedResponse);
                    }
                });
        });
    }
}
export default new Bot();