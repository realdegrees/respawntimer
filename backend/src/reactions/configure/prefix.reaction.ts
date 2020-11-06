import { StoreType } from '../../../lib/firebase';
import { VerboseError } from '../../common/errors/verbose.error';
import { GuildMessage, Reaction } from '../../common/reaction';

export const configurePrefixReaction = new Reaction<GuildMessage>(
    'prefix',
    async (message, context) => {
        if (!message.content) {
            throw new VerboseError('You didn\'t provide the desired prefix!');
        }
        if (message.content.length >= 1) {
            throw new VerboseError('The prefix can only be one character!');
        }
        return context.trigger.db.firestore.store(
            {
                prefix: message.content
            },
            [message.guild.id, 'config'].join('/'),
            { storeType: StoreType.PATCH }
        )
            .then(() => message.channel.send('I updated the prefix.'))
            .catch(() => new VerboseError('I couldn\'t update the prefix.'));
    });