import { Message } from 'discord.js';
import { DirectMessage, GuildMessage, Reaction } from '../../common/reaction';

export class DefaultReaction<
    T extends (GuildMessage | DirectMessage) = Message,
    X = undefined
    > extends Reaction<T, X>{ }