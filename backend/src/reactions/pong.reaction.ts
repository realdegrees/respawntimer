import { GuildMessage, Reaction } from '../common/reaction';

export const pong = new Reaction<GuildMessage>(async (message) => 
    await message.channel.send('pong')
);