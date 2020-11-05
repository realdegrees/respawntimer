import { GuildMessage, Reaction } from '../../common/reaction';
import { getSampleTriggerCommand } from '../../common/util';

export const useSubtriggerReaction = new Reaction<GuildMessage>('usage',
    async (message, context) => {
        const reactions = context.trigger.reactions.sub?.guild ?? [];
        const commands = await Promise.all(
            reactions.map(async (reaction) =>
                await getSampleTriggerCommand(
                    context.trigger,
                    message.guild, {
                    subTrigger: reaction.name
                })
            ));
        await message.channel.send(
            'This is not a standalone command try one of these:\n' +
            commands
        );
    }
);