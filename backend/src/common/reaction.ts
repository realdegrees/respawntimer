import { Guild, Message } from 'discord.js';
import { Trigger } from './types';

export class Reaction<T extends (GuildMessage | DirectMessage)> {
    // Set via reflection, do not use in constructor
    public readonly trigger!: Trigger;

    public constructor(
        private onReact: ReactionCallback<T> | AsyncReactionCallback<T>,
        private hooks?: Hooks<T>) { }

    public async run(message: T): Promise<void> {
        // TODO: Possibly add context from preReactionHook 
        // TODO: and pass context from the reaction to the postReactionHook
        // TODO: Define what context might be useful for logs or whatever
        return Promise.resolve()
            .then(() => this.hooks?.pre?.(message, this))
            .then(() => this.onReact(message, this))
            .then(() => this.hooks?.post?.(message, this));
    }
}
interface Hooks<T extends GuildMessage | DirectMessage> {
    pre?: ReactionCallback<T> | AsyncReactionCallback<T>;
    post?: ReactionCallback<T> | AsyncReactionCallback<T>;
}
type ReactionCallback<T extends GuildMessage | DirectMessage> = (
    message: T,
    context: Reaction<T>
) => void;
type AsyncReactionCallback<T extends GuildMessage | DirectMessage> = (
    message: T,
    context: Reaction<T>
) => Promise<void>;

export interface GuildMessage extends Omit<Message, 'guild'> {
    guild: Guild;
}
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface DirectMessage extends Omit<Message, 'guild'> {}