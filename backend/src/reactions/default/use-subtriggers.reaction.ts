import { GuildMessage, Reaction } from '../../common/reaction';
import { getSampleTriggerCommand } from '../../common/util';

// TODO: Check if message is guild message and adapt getSampleTriggerCommand
export const useSubtriggerReaction = Reaction.create<GuildMessage>({ name: 'usage' },
    async (context) => {
        const reactions = context.trigger.reactions.sub?.guild ?? [];
        const commands = await Promise.all(
            reactions.map(async (reaction) =>
                await getSampleTriggerCommand(
                    context.trigger,
                    context.message.guild, {
                    subTrigger: reaction.options.name
                })
            ));
        await context.message.channel.send(
            'This is not a standalone command try one of these:\n' +
            commands
        );
    }
);