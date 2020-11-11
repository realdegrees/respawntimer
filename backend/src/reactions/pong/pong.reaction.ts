import { GuildMessage, Reaction } from '../../common/reaction';

export const pong = Reaction.create<GuildMessage>({
    name: 'pong',
    shortDescription: 'Answers pong'
}, {
    message: async (context) =>
        await context.message.channel.send('pong')
});