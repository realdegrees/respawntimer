import { Guild, Message } from 'discord.js';
import { Trigger } from './types';
import { getSampleTriggerCommand } from './util';

export class Reaction<MessageType extends (GuildMessage | DirectMessage), HookType = undefined> {
    // Set via reflection, do not use in constructor
    public readonly trigger!: Trigger;

    public constructor(
        /** What is printed when the command is used wrong, only include  */
        public readonly name: string,
        private onReact: ReactionCallback<MessageType, HookType>,
        private hooks?: Hooks<MessageType, HookType>) { }

    public async run(message: MessageType): Promise<void> {
        // TODO: Possibly add context from preReactionHook 
        // TODO: and pass context from the reaction to the postReactionHook
        // TODO: Define what context might be useful for logs or whatever
        return Promise.resolve()
            .then(() => this.hooks?.pre?.(message, this))
            .then((hookInfo) => this.onReact(message, this, hookInfo))
            .then(() => this.hooks?.post?.(message, this))
            .then(); // Let the promise return void for now
    }
    public getTriggerString(guild: Guild): Promise<string> {
        return getSampleTriggerCommand(this.trigger, guild, {
            subTrigger: this.name
        });
    }
}
interface Hooks<T extends GuildMessage | DirectMessage, HookType> {
    pre?: HookCallback<T, HookType>;
    post?: HookCallback<T, HookType>;
}
type HookCallback<T extends GuildMessage | DirectMessage, HookType> = (
    message: T,
    context: Reaction<T, HookType>
) => PromiseLike<HookType>;
type ReactionCallback<T extends GuildMessage | DirectMessage, HookType> = (
    message: T,
    context: Reaction<T, HookType>,
    hookInfo: HookType | undefined
) => PromiseLike<unknown>;

export interface GuildMessage extends Omit<Message, 'guild'> {
    guild: Guild;
}
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface DirectMessage extends Omit<Message, 'guild'> { }