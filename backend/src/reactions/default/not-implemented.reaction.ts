import { Reaction } from '../../common/reaction';

export const notImplementedReaction = Reaction.create({
    name: '',
    shortDescription: ''
}, {
    message: async (context) =>
        await context.message.channel.send('This command is not implemented yet!')
});