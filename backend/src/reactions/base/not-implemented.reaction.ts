import { GuildMessage, Reaction } from '../../common/reaction';

export const notImplementedReaction = new Reaction<GuildMessage>(
    (message) => message.channel.send('This command is not implemented yet!')
);