// Info about the specified sound command like duration etc.

import { Message } from 'discord.js';
import { Reaction } from '../../common/reaction';

const audioInfoReaction = Reaction.create<
    Message
>({
    name: 'info',
    shortDescription: 'Provides info on the specified audio command'
}, {
    message: (context) => {
        return Promise.resolve(5);
    }
});