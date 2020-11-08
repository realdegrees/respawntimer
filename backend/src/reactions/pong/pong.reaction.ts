import { GuildMessage, Reaction } from '../../common/reaction';

export const pong = Reaction.create<GuildMessage>({name: 'pong'}, async(context) =>
    await context.message.channel.send('pong')
);