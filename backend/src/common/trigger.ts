import { Message } from 'discord.js';
import { TriggerMatch } from './types';
import { TriggerOptions } from './types/trigger-options';
import { Reaction } from './reaction';
import Bot from '../bot';
import Firebase from '../../lib/firebase';
import { escapeRegex, fetchPrefix } from './util';

export class Trigger {
    // Set via reflection, do not use in constructor
    public readonly bot!: Omit<Bot, 'use'>;
    // Set via reflection, do not use in constructor
    public readonly db!: Firebase;

    /**
     * Creates a new Trigger that issues the callback when a message 
     * is sent that passes the conditions provided in the options param
     * @param reaction The reaction object to be executed after a successful permission check
     * @param options If not provided, the callback will be triggered on every message
     */
    public constructor(
        public readonly reactionMap: ReactionMap,
        public readonly options?: TriggerOptions,
    ) {
        // ! This reflection must be the first expression on instantiation
        Object.values(reactionMap)
            .forEach((reactions) =>
                reactions?.forEach((reaction) => Reflect.set(reaction, 'trigger', this))
            );
    }

    public react(message: Message): Promise<unknown[]> {
        const subTrigger = message.content.split(' ')[0] || 'default';
        if (subTrigger !== 'default') {
            this.removeFromMessage(message, subTrigger);
        }
        const reactions = this.reactionMap[subTrigger];

        return reactions ?
            Promise.all(
                reactions.map(
                    (reaction) => reaction.run(message)
                )) :
            Promise.reject(`You cannot run this command with "${subTrigger}"`);
    }

    public patchOptions(options: TriggerOptions): void {
        Object.assign(this.options, options);
    }

    /**
     * Checks if this Trigger instance should issue its' 
     * callback based on the options provided in constructor
     * @param message 
     */
    public check(message: Message): Promise<Message> {
        return this.checkCommand(message)
            .then((message) => this.checkChannel(message))
            .then((message) => this.checkPermission(message))
            .then((message) => this.checkRoles(message))
            .then((message) => this.checkCustomCondition(message));
    }



    private checkCommand(message: Message): Promise<Message> {
        const content = message.content;
        return new Promise((resolve, reject) => {
            if (!this.options?.commandOptions) {
                resolve(message);
                return;
            }

            this.options.commandOptions.command.forEach(async (commandValue) => {
                const prefix = !this.options?.commandOptions?.ignorePrefix && message.guild?.id ?
                    await fetchPrefix(message.guild.id, this.db) : '';
                const command = prefix + commandValue;

                switch (this.options?.commandOptions?.match) {
                    case TriggerMatch.CONTAINS:
                        if (content.includes(command)) {
                            this.removeFromMessage(message, command);
                            resolve(message);
                            return;
                        }
                        break;
                    case TriggerMatch.EQUALS:
                        if (content.match(new RegExp(`^${escapeRegex(command)}$`))) {
                            this.removeFromMessage(message, command);
                            resolve(message);
                            return;
                        }
                        break;
                    case TriggerMatch.STARTS_WITH:
                        if (
                            content.match(new RegExp(`^${escapeRegex(command)} .*`)) ||
                            content.match(new RegExp(`^${escapeRegex(command)}$`))
                        ) {
                            this.removeFromMessage(message, command);
                            resolve(message);
                            return;
                        }
                        break;
                }
                reject();
            });
        });
    }
    /**
     * Removes the specified text from the message and cleans whitespaces
     */
    private removeFromMessage(message: Message, text: string): void {
        message.content = message.content.split(text).join('').replace(/\s{2,}/g, ' ').trim();
    }
    private async checkCustomCondition(message: Message): Promise<Message> {
        return Promise.resolve()
            .then(() => this.options?.conditionCheck?.(message, this))
            .then(() => message);
    }
    private checkChannel(message: Message): Promise<Message> {
        const channelId = message.channel.id;
        return new Promise((resolve, reject) => {
            if (this.options?.channels) {
                const isIncluded = this.options.channels.include?.length ?
                    this.options.channels.include.includes(channelId) :
                    true;
                const isExcluded = this.options.channels.exclude?.includes(channelId);

                isIncluded && !isExcluded ? resolve(message) : reject();
            } else {
                resolve(message);
            }
        });
    }
    private checkRoles(message: Message): Promise<Message> {
        const member = message.member;
        return new Promise((resolve, reject) => {
            if (!this.options?.roles) {
                resolve(message);
                return;
            }
            if (member) {
                const isIncluded = this.options.roles.include?.length ?
                    this.options.roles.include.some(
                        (role) => member.roles.resolve(role)) :
                    true;
                const isExcluded = this.options.roles.exclude?.some(
                    (role) => member.roles.resolve(role));

                isIncluded && !isExcluded ?
                    resolve(message) :
                    reject('You are missing a required role for this command!');
            } else {
                reject('Unable to retrieve message author! Can\'t check roles');
            }
        });
    }
    /**
     * Checks if the provided member has the right to issue this command
     * Dictated by the commandOptions for this trigger
     * @param member 
     */
    private checkPermission(message: Message): Promise<Message> {
        const member = message.member;
        return new Promise((resolve, reject) => {
            if (!this.options?.requiredPermissions) {
                resolve(message);
                return;
            }
            if (member) {
                if (this.options.requiredPermissions.every(
                    (permission) => member.hasPermission(permission))
                ) {
                    resolve(message);
                } else {
                    reject('You do not have permission to issue this command!');
                }
            } else {
                reject('Unable to retrieve message author! Can\'t check permissions');
            }
        });
    }
}
type ReactionMap = {
    readonly default: Reaction[];
    readonly [subTrigger: string]: Reaction[] | undefined;
};
export type TriggerCondition = (
    message: Message,
    context: Trigger
) => void;
export type AsyncTriggerCondition = (
    message: Message,
    context: Trigger
) => Promise<void>;