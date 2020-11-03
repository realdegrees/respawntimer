import { GuildMessage, Reaction } from '../../common/reaction';

export const configurePrefixReaction = new Reaction<GuildMessage>(
    'prefix',
    async (message, context) => {
        try {
            if (!message.content) {
                message.channel.send('You didn\'t provide the desired prefix!');
                return;
            }
            await context.trigger.db.firestore.update(
                {
                    prefix: message.content
                },
                [message.guild.id, 'config'].join('/')
            );
            message.channel.send('I updated the prefix.');
        } catch (e) {
            message.channel.send('I couldn\'t update the prefix.');
        }
    });