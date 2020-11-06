import { Guild, GuildMember, Message } from 'discord.js';
import { DefaultReaction } from '../reactions/default/default.reaction';
import { InternalError } from './errors/internal.error';
import { Trigger } from './types';
import { getSampleTriggerCommand } from './util';

export class Reaction<
    MessageType extends (GuildMessage | DirectMessage) = Message,
    HookType = undefined> {
    // Set via reflection, do not use in constructor
    public readonly trigger!: Trigger;

    public constructor(
        /** What is printed when the command is used wrong, only include  */
        public readonly name: string,
        private onReact: ReactionCallback<MessageType, HookType> |
            DefaultReaction<MessageType, HookType>,
        private hooks?: Hooks<MessageType, HookType>) { }

    public async run(message: MessageType): Promise<unknown> {
        // TODO: Possibly add context from preReactionHook 
        // TODO: and pass context from the reaction to the postReactionHook
        // TODO: Define what context might be useful for logs or whatever
        return this.onReact instanceof Reaction ?
            this.onReact.run(message) :
            Promise.resolve()
                .then(() => this.hooks?.pre?.(message, this))
                .then((hookInfo) => {
                    if (this.hooks?.pre && !hookInfo) {
                        throw new InternalError(
                            'A pre hook was defined but did not return anything in ' + 
                            `'${this.name}'`
                        );
                    }
                    return (this.onReact as ReactionCallback<
                        MessageType, HookType
                    >)(message, this, hookInfo as HookType);
                })
                .then(() => this.hooks?.post?.(message, this));
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
    hookInfo: HookType
) => PromiseLike<unknown>;

export interface GuildMessage extends Omit<Message, 'guild' | 'member'> {
    guild: Guild;
    member: GuildMember;
}
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface DirectMessage extends Omit<Message, 'guild' | 'member'> { }