import { Reaction } from '../../common/reaction';

export const notImplementedReaction = new Reaction('not-implemented',
    async (message) => await message.channel.send('This command is not implemented yet!')
);