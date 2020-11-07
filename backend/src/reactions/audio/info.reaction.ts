// Info about the specified sound command like duration etc.

import { Message } from 'discord.js';
import { Reaction } from '../../common/reaction';

const audioInfoReaction = Reaction.create<
    Message,
    string,
    number
>('', (message, context, hookContext) => {
    return Promise.resolve(5);
}, {
    pre: (message, context) => {
        return Promise.resolve('');
    },
    post: (message, context) => {
        return Promise.resolve(5);
    }
});