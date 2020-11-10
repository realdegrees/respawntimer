import logger from '../../../lib/logger';
import { VerboseError } from '../../common/errors/verbose.error';
import { GuildMessage, Reaction } from '../../common/reaction';

export const audioRemoveReaction = Reaction.create<GuildMessage>({
    name: 'remove'
}, (context) => {
    const command = context.message.content.split(' ')[0].trim();
    return context.trigger.db.firestore.delete([
        'guilds',
        context.message.guild.id,
        'audio',
        command
    ].join('/'))
        .then((deleted) => deleted ?
            context.message.channel.send('Deleted *' + command + '*') :
            context.message.channel.send('Command ' + command + ' doesn\'t exist.'))
        .catch((e) => {
            logger.warn(e);
            throw new VerboseError('Couldn\'t delete *' + command + '*');
        });
});