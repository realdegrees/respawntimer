import { GuildMessage, Reaction } from '../common/reaction';

export const pong = new Reaction<GuildMessage>('pong', async (message) =>
    await message.channel.send('pong')
);