import { Message } from 'discord.js';
import { Trigger } from './types';

export class Reaction {
    // Set via reflection, do not use in constructor
    public readonly trigger!: Trigger;

    public constructor(private onReact: ReactionCallback, private hooks?: Hooks) {
    }

    public async run(message: Message): Promise<void> {
        // TODO: Possibly add context from preReactionHook 
        // TODO: and pass context from the reaction to the postReactionHook
        // TODO: Define what context might be useful for logs or whatever
        return Promise.resolve()
            .then(() => this.hooks?.pre?.(this, message))
            .then(() => this.onReact(this, message))
            .then(() => this.hooks?.post?.(this, message));
    }
}
interface Hooks {
    pre?: ReactionCallback;
    post?: ReactionCallback;
}
type ReactionCallback = (context: Reaction, message: Message) => Promise<void>;
