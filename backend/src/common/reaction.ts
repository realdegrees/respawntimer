import { Guild, GuildMember, Message } from 'discord.js';
import { number } from 'yargs';
import logger from '../../lib/logger';
import { Trigger } from './types';
import { RequireAtLeastOne, RequiredPartial } from './types/required';
import { getSampleTriggerCommand } from './util';

export class Reaction<
    MessageType extends GuildMessage | DirectMessage = Message,
    PreHookType = undefined,
    PostHookType = undefined> {
    // Set via reflection, do not use in constructor
    public readonly trigger!: Trigger;

    private constructor(
        public readonly options: ReactionOptions,
        private onReact: ReactionCallback<MessageType, PreHookType> |
            Reaction<MessageType, PreHookType>,
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
        onReact: ReactionCallback<MessageType> |
            Reaction<MessageType>
    ): Reaction<MessageType>;

    public static create<
        MessageType extends GuildMessage | DirectMessage,
        PreHookType,
        PostHookType = undefined
    >(
        /** What is printed when the command is used wrong, only include  */
        options: ReactionOptions,
        onReact: ReactionCallback<MessageType, PreHookType> |
            Reaction<MessageType, PreHookType>,
        hooks: RequiredPartial<Hooks<MessageType, PreHookType, PostHookType>, 'pre'>
    ): Reaction<MessageType, PreHookType, PostHookType>;

    public static create<
        MessageType extends GuildMessage | DirectMessage,
        PostHookType,
        PreHookType = undefined
    >(
        /** What is printed when the command is used wrong, only include  */
        options: ReactionOptions,
        onReact: ReactionCallback<MessageType, PreHookType> |
            Reaction<MessageType, PreHookType>,
        hooks: RequiredPartial<Hooks<MessageType, PreHookType, PostHookType>, 'post'>
    ): Reaction<MessageType, PreHookType, PostHookType>;


    public static create<
        MessageType extends GuildMessage | DirectMessage = Message,
        PreHookType = undefined,
        PostHookType = undefined
    >(
        /** What is printed when the command is used wrong, only include  */
        options: ReactionOptions,
        onReact: ReactionCallback<MessageType, PreHookType> |
            Reaction<MessageType, PreHookType>,
        hooks?: RequireAtLeastOne<Hooks<MessageType, PreHookType, PostHookType>>
    ): Reaction<MessageType, PreHookType, PostHookType> {
        return new Reaction(options, onReact, hooks);
    }

    public async run(message: MessageType): Promise<unknown> {
        // TODO: Possibly add context from preReactionHook 
        // TODO: and pass context from the reaction to the postReactionHook
        // TODO: Define what context might be useful for logs or whatever
        message.content.split(' ').forEach((value, index) => {
            if (this.options.args?.[index]) {
                this.options.args[index].value = value;
            }
        });

        return this.onReact instanceof Reaction ?
            this.onReact.run(message) :
            Promise.resolve()
                .then(() => this.hooks?.pre?.(
                    Object.assign({ message, trigger: this.trigger }, this.options))
                )
                .then((hookInfo) => {
                    return (this.onReact as ReactionCallback<
                        MessageType, PreHookType
                    >)(
                        Object.assign({ message, trigger: this.trigger }, this.options),
                        hookInfo as PreHookType
                    );
                })
                .then(() => this.hooks?.post?.(
                    Object.assign({ message, trigger: this.trigger }, this.options)
                ));
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
    context: ReactionOptions & { message: T } & { trigger: Trigger }
) => PromiseLike<HookType>;
type PreHookCallback<T extends GuildMessage | DirectMessage, HookType> = (
    context: ReactionOptions & { message: T } & { trigger: Trigger }

) => PromiseLike<HookType>;
type ReactionCallback<T extends GuildMessage | DirectMessage, HookType = undefined> = (
    context: ReactionOptions & { message: T } & { trigger: Trigger },
    hookInfo: HookType
) => PromiseLike<unknown>;

export interface GuildMessage extends Omit<Message, 'guild' | 'member'> {
    guild: Guild;
    member: GuildMember;
}
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface DirectMessage extends Omit<Message, 'guild' | 'member'> { }
export interface ReactionOptions {
    readonly name: string;
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