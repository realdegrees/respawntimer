import { StoreType } from '../../../lib/firebase';
import { VerboseError } from '../../common/errors/verbose.error';
import { GuildMessage, Reaction } from '../../common/reaction';

export const configurePrefixReaction = Reaction.create<GuildMessage>(
    {
        name: 'prefix'
    },
    async (context) => {
        if (!context.message.content) {
            throw new VerboseError('You didn\'t provide the desired prefix!');
        }
        if (context.message.content.length > 1) {
            throw new VerboseError('The prefix can only be one character!');
        }
        return context.trigger.db.firestore.store(
            {
                prefix: context.message.content
            },
            [context.message.guild.id, 'config'].join('/'),
            { storeType: StoreType.PATCH }
        )
            .then(() => context.message.channel.send('I updated the prefix.'))
            .catch(() => new VerboseError('I couldn\'t update the prefix.'));
    });