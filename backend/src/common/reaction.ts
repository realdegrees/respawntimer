import { Guild, GuildMember, Message, MessageReaction, PartialUser, User } from 'discord.js';
import logger from '../../lib/logger';
import { Trigger } from './types';
import { RequireAtLeastOne, RequiredPartial } from './types/required';
import { getSampleTriggerCommand } from './util';

interface Listeners<
    MessageType extends GuildMessage | DirectMessage = Message,
    PreHookType = undefined
    > {
    readonly message?: MessageCallback<MessageType, PreHookType> |
        Reaction<MessageType, PreHookType>;
    readonly reaction?: ReactionCallback<MessageType>;
}
export class Reaction<
    MessageType extends GuildMessage | DirectMessage = Message,
    PreHookType = undefined,
    PostHookType = undefined> {
    // Set via reflection, do not use in constructor
    public readonly trigger!: Trigger;

    private constructor(
        public readonly options: ReactionOptions,
        public readonly on: Listeners<MessageType, PreHookType>,
        private hooks?: Partial<Hooks<MessageType, PreHookType, PostHookType>>) {
        if (options.name === 'help') {
            logger.warn('The reacton name help is reserved for the help callback!');
        }
    }

    public static create<
        MessageType extends (GuildMessage | DirectMessage) = Message
    >(
        /** What is printed when the command is used wrong, only include  */
        options: ReactionOptions,
        on: Listeners<MessageType>
    ): Reaction<MessageType>;

    public static create<
        MessageType extends GuildMessage | DirectMessage,
        PreHookType,
        PostHookType = undefined
    >(
        /** What is printed when the command is used wrong, only include  */
        options: ReactionOptions,
        on: Listeners<MessageType, PreHookType>,

        hooks: RequiredPartial<Hooks<MessageType, PreHookType, PostHookType>, 'pre'>
    ): Reaction<MessageType, PreHookType, PostHookType>;

    public static create<
        MessageType extends GuildMessage | DirectMessage,
        PostHookType,
        PreHookType = undefined
    >(
        /** What is printed when the command is used wrong, only include  */
        options: ReactionOptions,
        on: Listeners<MessageType, PreHookType>,

        hooks: RequiredPartial<Hooks<MessageType, PreHookType, PostHookType>, 'post'>
    ): Reaction<MessageType, PreHookType, PostHookType>;


    public static create<
        MessageType extends GuildMessage | DirectMessage = Message,
        PreHookType = undefined,
        PostHookType = undefined
    >(
        /** What is printed when the command is used wrong, only include  */
        options: ReactionOptions,
        on: Listeners<MessageType, PreHookType>,
        hooks?: RequireAtLeastOne<Hooks<MessageType, PreHookType, PostHookType>>
    ): Reaction<MessageType, PreHookType, PostHookType> {
        return new Reaction(options, on, hooks);
    }


    public async consumeMessage(message: MessageType, args: string[]): Promise<unknown> {
        // TODO: Possibly add context from preReactionHook 
        // TODO: and pass context from the reaction to the postReactionHook
        // TODO: Define what context might be useful for logs or whatever

        const sampleCommand = await getSampleTriggerCommand(
            this.trigger,
            (message as unknown as Message).guild, {
            subTrigger: this.options.name
        });
        return this.on.message instanceof Reaction ?
            this.on.message.consumeMessage(message, args) :
            Promise.resolve()
                .then(() => this.hooks?.pre?.(
                    Object.assign({
                        message,
                        args,
                        sampleCommand,
                        trigger: this.trigger
                    }, this.options))
                )
                .then((hookInfo) => {
                    return (this.on.message as MessageCallback<
                        MessageType, PreHookType
                    >)(
                        Object.assign({
                            message,
                            args,
                            sampleCommand,
                            trigger: this.trigger
                        }, this.options),
                        hookInfo as PreHookType
                    );
                })
                .then(() => this.hooks?.post?.(
                    Object.assign({
                        message,
                        args,
                        sampleCommand,
                        trigger: this.trigger
                    }, this.options)
                ));
    }

    public async consumeReaction(reaction: Omit<MessageReaction, 'message'> & {
        message: MessageType;
    }, user: User): Promise<unknown> {
        return this.on.reaction?.(Object.assign({
            reaction,
            user,
            trigger: this.trigger
        }, this.options));
    }

    public getTriggerString(guild: Guild): Promise<string> {
        return getSampleTriggerCommand(this.trigger, guild, {
            subTrigger: this.options.name
        });
    }
}
interface Hooks<T extends GuildMessage | DirectMessage, PreHookType, PostHookType> {
    pre: PreHookCallback<T, PreHookType>;
    post: PostHookCallback<T, PostHookType>;
}
type PostHookCallback<T extends GuildMessage | DirectMessage, HookType> = (
    context: ReactionOptions & {
        message: T;
        args: string[];
        trigger: Trigger;
        sampleCommand: string;
    }
) => PromiseLike<HookType>;
type PreHookCallback<T extends GuildMessage | DirectMessage, HookType> = (
    context: ReactionOptions & {
        message: T;
        args: string[];
        trigger: Trigger;
        sampleCommand: string;
    }

) => PromiseLike<HookType>;
type MessageCallback<T extends GuildMessage | DirectMessage, HookType = undefined> = (
    context: ReactionOptions & {
        message: T;
        args: string[];
        trigger: Trigger;
        sampleCommand: string;
    },
    hookInfo: HookType
) => PromiseLike<unknown>;
type ReactionCallback<T extends GuildMessage | DirectMessage> = (
    context: ReactionOptions & {
        reaction: Omit<MessageReaction, 'message'> & {
            message: T;
        };
        /** The suer that reacted */
        user: User | PartialUser;
        trigger: Trigger;
    }
) => PromiseLike<unknown>;

export interface GuildMessage extends Omit<Message, 'guild' | 'member'> {
    guild: Guild;
    member: GuildMember;
}
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface DirectMessage extends Omit<Message, 'guild' | 'member'> { }
export interface ReactionOptions {
    readonly name: string;
    readonly shortDescription?: string;
    // TODO: automatically parse args according to the defined number 
    // TODO: and pass them together with the context
    // TODO: also maybe exclude the arg names or make new property 'argsParsed'
    readonly args?: {
        readonly [name: string]: {
            position: number;
            defaultValue?: string;
            required?: boolean;
        };
    };
}