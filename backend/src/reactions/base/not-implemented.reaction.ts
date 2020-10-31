import { Reaction } from '../../common/reaction';

export const notImplementedReaction = new Reaction(
    (message) => message.channel.send('This command is not implemented yet!')
);