import { GuildMessage, Reaction } from '../../common/reaction';

export const pong = Reaction.create<GuildMessage>('pong', async (message) =>
    await message.channel.send('pong')
);