import { Message } from 'discord.js';
import { DirectMessage, GuildMessage, Reaction } from '../reaction';

export type ReactionMap = {
    readonly default: ReactionMapItem;
    readonly sub?: ReactionMapItem;
};
export type ReactionMapItem = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readonly guild?: Reaction<GuildMessage, any>[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readonly direct?: Reaction<DirectMessage, any>[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readonly all?: Reaction<Message, any>[];
};
