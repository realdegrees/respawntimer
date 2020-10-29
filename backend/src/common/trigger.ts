import { Message, GuildMember } from 'discord.js';
import { dynamicConfig } from './dynamic-config';
import { TriggerMatch } from './types';
import { TriggerOptions } from './types/trigger-options';
import logger from '../../lib/logger';
import { Reaction } from './reaction';
import Bot from '../bot';
import Firebase from '../../lib/firebase';

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
        private readonly reactions: Reaction[],
        public readonly options?: TriggerOptions,
    ) {
        // ! This reflection must be the first expression on instantiation
        reactions.forEach((reaction) => Reflect.set(reaction, 'trigger', this));
        if (options?.commandOptions?.command.startsWith(dynamicConfig.commandPrefix)) {
            options.commandOptions.command.replace(dynamicConfig.commandPrefix, '');
            logger.warn(
                `The command in this Trigger 
                ${options.commandOptions.command} already contains the prefix!`,
                'It was automatically removed.');
        }
    }

    public react(message: Message): Promise<unknown[]> {
        return Promise.all(
            this.reactions.map(
                (reaction) => reaction.run(message)
            ));
    }

    public patchOptions(options: TriggerOptions): void {
        Object.assign(this.options, options);
    }

    /**
     * Checks if this Trigger instance should issue its' 
     * callback based on the options provided in constructor
     * @param message 
     */
    public check(message: Message): Promise<void> {
        return this.checkCommand(message.content)
            .then(() => this.checkChannel(message.channel.id))
            .then(() => this.checkPermission(message.member))
            .then(() => this.checkRoles(message.member))
            .then(() => this.checkCustomCondition(message));
    }



    private checkCommand(message: string): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.options?.commandOptions) {
                resolve();
                return;
            }

            const command =
                `${this.options.commandOptions.ignorePrefix ? '' : dynamicConfig.commandPrefix}`
                + this.options.commandOptions.command;

            switch (this.options.commandOptions.match) {
                case TriggerMatch.CONTAINS:
                    message.includes(command) ? resolve() : reject();
                    break;
                case TriggerMatch.EQUALS:
                    message === command ? resolve() : reject();
                    break;
                case TriggerMatch.STARTS_WITH:
                    message.startsWith(command) ? resolve() : reject();
                    break;
            }
        });
    }
    private checkCustomCondition(message: Message): Promise<void> {
        return this.options?.conditionCheck ?
            this.options.conditionCheck(this, message, this.options) :
            Promise.resolve();
    }
    private checkChannel(channelId: string): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.options?.channels) {
                const isIncluded = this.options.channels.include?.length ?
                    this.options.channels.include.includes(channelId) :
                    true;
                const isExcluded = this.options.channels.exclude?.includes(channelId);

                isIncluded && !isExcluded ? resolve() : reject();
            } else {
                resolve();
            }
        });
    }
    private checkRoles(member: GuildMember | null): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.options?.roles) {
                resolve();
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
                    resolve() :
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
    private checkPermission(member: GuildMember | null): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.options?.requiredPermissions) {
                resolve();
                return;
            }
            if (member) {
                if (this.options.requiredPermissions.every(
                    (permission) => member.hasPermission(permission))
                ) {
                    resolve();
                } else {
                    reject('You do not have permission to issue this command!');
                }
            } else {
                reject('Unable to retrieve message author! Can\'t check permissions');
            }
        });
    }
}
export type TriggerCondition = (
    context: Trigger,
    message: Message,
    options?: TriggerOptions
) => Promise<void>;