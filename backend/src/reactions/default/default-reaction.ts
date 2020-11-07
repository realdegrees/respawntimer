import { Message } from 'discord.js';
import { GuildMessage, DirectMessage, Reaction } from '../../common/reaction';

export class DefaultReaction<
    T extends (GuildMessage | DirectMessage) = Message,
    X = undefined,
    Y = undefined,
    > extends Reaction<T, X, Y>{ }