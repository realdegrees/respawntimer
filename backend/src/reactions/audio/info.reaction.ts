// Info about the specified sound command like duration etc.

import { Message } from 'discord.js';
import { Reaction } from '../../common/reaction';

const audioInfoReaction = Reaction.create<
    Message
>({name: 'info'}, (context) => {
    return Promise.resolve(5);
});