import { GuildMessage, Reaction } from '../../common/reaction';
import { getSampleTriggerCommand } from '../../common/util';

// TODO: Check if message is guild message and adapt getSampleTriggerCommand
export const useSubtriggerReaction = Reaction.create<GuildMessage>('usage',
    async (message, trigger) => {
        const reactions = trigger.reactions.sub?.guild ?? [];
        const commands = await Promise.all(
            reactions.map(async (reaction) =>
                await getSampleTriggerCommand(
                    trigger,
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