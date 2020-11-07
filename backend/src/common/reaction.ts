import { Guild, GuildMember, Message } from 'discord.js';
import logger from '../../lib/logger';
import { DefaultReaction } from '../reactions/default/default-reaction';
import { Trigger } from './types';
import { RequireAtLeastOne, RequiredPartial } from './types/required';
import { getSampleTriggerCommand } from './util';

export class Reaction<
    MessageType extends GuildMessage | DirectMessage = Message,
    PreHookType = undefined,
    PostHookType = undefined> {
    // Set via reflection, do not use in constructor
    public readonly trigger!: Trigger;

    public constructor(
        public readonly name: string,
        private onReact: ReactionCallback<MessageType, PreHookType> |
            DefaultReaction<MessageType, PreHookType>,
        private hooks?: Partial<Hooks<MessageType, PreHookType, PostHookType>>) {
        if (name === 'help') {
            logger.warn('The reacton name help is reserved for the help callback!');
        }
    }

    public static create<
        MessageType extends (GuildMessage | DirectMessage) = Message
    >(
        /** What is printed when the command is used wrong, only include  */
        name: string,
        onReact: ReactionCallback<MessageType> |
            DefaultReaction<MessageType>
    ): Reaction<MessageType>;

    public static create<
        MessageType extends GuildMessage | DirectMessage,
        PreHookType,
        PostHookType = undefined
    >(
        /** What is printed when the command is used wrong, only include  */
        name: string,
        onReact: ReactionCallback<MessageType, PreHookType> |
            DefaultReaction<MessageType, PreHookType>,
        hooks: RequiredPartial<Hooks<MessageType, PreHookType, PostHookType>, 'pre'>
    ): Reaction<MessageType, PreHookType, PostHookType>;

    public static create<
        MessageType extends GuildMessage | DirectMessage,
        PostHookType,
        PreHookType = undefined
    >(
        /** What is printed when the command is used wrong, only include  */
        name: string,
        onReact: ReactionCallback<MessageType, PreHookType> |
            DefaultReaction<MessageType, PreHookType>,
        hooks: RequiredPartial<Hooks<MessageType, PreHookType, PostHookType>, 'post'>
    ): Reaction<MessageType, PreHookType, PostHookType>;


    public static create<
        MessageType extends GuildMessage | DirectMessage = Message,
        PreHookType = undefined,
        PostHookType = undefined
    >(
        /** What is printed when the command is used wrong, only include  */
        name: string,
        onReact: ReactionCallback<MessageType, PreHookType> |
            DefaultReaction<MessageType, PreHookType>,
        hooks?: RequireAtLeastOne<Hooks<MessageType, PreHookType, PostHookType>>
    ): Reaction<MessageType, PreHookType, PostHookType> {
        return new Reaction(name, onReact, hooks);
    }

    public async run(message: MessageType): Promise<unknown> {
        // TODO: Possibly add context from preReactionHook 
        // TODO: and pass context from the reaction to the postReactionHook
        // TODO: Define what context might be useful for logs or whatever
        return this.onReact instanceof Reaction ?
            this.onReact.run(message) :
            Promise.resolve()
                .then(() => this.hooks?.pre?.(message, this.trigger))
                .then((hookInfo) => {
                    return (this.onReact as ReactionCallback<
                        MessageType, PreHookType
                        >)(message, this.trigger, hookInfo as PreHookType);
                })
                .then(() => this.hooks?.post?.(message, this.trigger));
    }
    public getTriggerString(guild: Guild): Promise<string> {
        return getSampleTriggerCommand(this.trigger, guild, {
            subTrigger: this.name
        });
    }
}
interface Hooks<T extends GuildMessage | DirectMessage, PreHookType, PostHookType> {
    pre: PreHookCallback<T, PreHookType>;
    post: PostHookCallback<T, PostHookType>;
}
type PostHookCallback<T extends GuildMessage | DirectMessage, HookType> = (
    message: T,
    trigger: Trigger
) => PromiseLike<HookType>;
type PreHookCallback<T extends GuildMessage | DirectMessage, HookType> = (
    message: T,
    trigger: Trigger
) => PromiseLike<HookType>;
type ReactionCallback<T extends GuildMessage | DirectMessage, HookType = undefined> = (
    message: T,
    trigger: Trigger,
    hookInfo: HookType
) => PromiseLike<unknown>;

export interface GuildMessage extends Omit<Message, 'guild' | 'member'> {
    guild: Guild;
    member: GuildMember;
}
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface DirectMessage extends Omit<Message, 'guild' | 'member'> { }