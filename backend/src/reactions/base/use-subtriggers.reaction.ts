import { GuildMessage, Reaction } from '../../common/reaction';
import { getSampleTriggerCommand } from '../../common/util';

export const useSubtriggerReaction = new Reaction<GuildMessage>(
    async (message, context) => {
        const subTriggers = Object.keys(context.trigger.reactionMap)
            .filter((subTrigger) => subTrigger !== 'default');
        const commands = await Promise.all(
            subTriggers.map(async (subTrigger) =>
                await getSampleTriggerCommand(
                    context.trigger,
                    message.guild.id, {
                    subTrigger
                })
            ));
        message.channel.send(
            'This is not a standalone command try one of these:\n' +
            commands
        );
    }
);