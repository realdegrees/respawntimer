import { Reaction } from '../../common/reaction';

export const notImplementedReaction = Reaction.create('not-implemented',
    async (message) => await message.channel.send('This command is not implemented yet!')
);