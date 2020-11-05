import { GuildMessage, Reaction } from '../common/reaction';

export const pong = new Reaction<GuildMessage>('pong', (message) =>
    message.channel.send('pong')
);