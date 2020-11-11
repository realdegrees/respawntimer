import logger from '../../../lib/logger';
import { VerboseError } from '../../common/errors/verbose.error';
import { GuildMessage, Reaction } from '../../common/reaction';

export const audioRemoveReaction = Reaction.create<GuildMessage>({
    name: 'remove',
    shortDescription: 'Removes the specified audio command from the server'
}, {
    message: async (context) => {
        const command = context.message.content.split(' ')[0].trim();
        try {
            const deleted = await context.trigger.db.firestore.delete([
                'guilds',
                context.message.guild.id,
                'audio',
                command
            ].join('/'));
            return await (deleted ?
                context.message.channel.send('Deleted *' + command + '*') :
                context.message.channel.send('Command ' + command + ' doesn\'t exist.'));
        } catch (e) {
            logger.warn(e);
            throw new VerboseError('Couldn\'t delete *' + command + '*');
        }
    }
});