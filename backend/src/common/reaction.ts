import { Message } from 'discord.js';

export class Reaction {
    public constructor(private onReact: ReactionCallback, private hooks?: Hooks ) {
    }

    public async run(message: Message): Promise<void> {
        // TODO: Possibly add context from preReactionHook 
        // TODO: and pass context from the reaction to the postReactionHook
        // TODO: Define what context might be useful for logs or whatever
        return Promise.resolve()
        .then(() => this.hooks?.pre?.(message))
        .then(() => this.onReact(message))
        .then(() => this.hooks?.post?.(message));
    }
}
interface Hooks {
    pre?: (message: Message) => Promise<void>;
    post?: (message: Message) => Promise<void>;
}
type ReactionCallback = (message: Message) => Promise<void>;
