import { Message } from 'discord.js';
import { Trigger } from './types';

export class Reaction {
    // Set via reflection, do not use in constructor
    public readonly trigger!: Trigger;

    public constructor(
        private onReact: ReactionCallback | AsyncReactionCallback,
        private hooks?: Hooks) { }

    public async run(message: Message): Promise<void> {
        // TODO: Possibly add context from preReactionHook 
        // TODO: and pass context from the reaction to the postReactionHook
        // TODO: Define what context might be useful for logs or whatever
        return Promise.resolve()
            .then(() => this.hooks?.pre?.(message, this))
            .then(() => this.onReact(message, this))
            .then(() => this.hooks?.post?.(message, this));
    }
}
interface Hooks {
    pre?: ReactionCallback | AsyncReactionCallback;
    post?: ReactionCallback | AsyncReactionCallback;
}
type ReactionCallback = (message: Message, context: Reaction) => void;
type AsyncReactionCallback = (message: Message, context: Reaction) => Promise<void>;