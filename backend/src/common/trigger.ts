import { Message, GuildMember } from 'discord.js';
import { dynamicConfig } from './dynamic-config';
import { TriggerMatch } from './types';
import { TriggerOptions } from './types/trigger-options';
import logger from '../../lib/logger';

export class Trigger {
    /**
     * Creates a new Trigger that issues the callback when a message 
     * is sent that passes the conditions provided in the options param
     * @param callback The function to call when a message passing the conditions in options is sent
     * @param options If not provided, the callback will be triggered on every message
     */
    public constructor(public callback: TriggerCallback, private options?: TriggerOptions) {
        if (options?.commandOptions?.command.startsWith(dynamicConfig.commandPrefix)) {
            options.commandOptions.command.replace(dynamicConfig.commandPrefix, '');
            logger.warn(
                `The command in this Trigger 
                ${options.commandOptions.command} already contains the prefix!`,
                'It was automatically removed.');
        }
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
            .then(() => this.checkCustomCondition(message));
    }



    private checkCommand(message: string): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.options?.commandOptions) {
                resolve();
                return;
            }

            const command =
                `${this.options.commandOptions.ignorePrefix ? '' : dynamicConfig.commandPrefix}
                ${this.options.commandOptions.command}`;

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
            this.options.conditionCheck(message, this.options) :
            Promise.resolve();
    }
    private checkChannel(channelId: string): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.options?.channels) {
                const isIncluded = this.options.channels.include?.includes(channelId);
                const isExcluded = this.options.channels.exclude?.includes(channelId);

                isIncluded && !isExcluded ? resolve() : reject();
            } else {
                resolve();
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
            if (!this.options?.rolePermissions) {
                resolve();
                return;
            }
            if (member) {
                this.options.rolePermissions.some(
                    (permission) => member.roles.cache.has(permission)
                ) ?
                    resolve() :
                    reject('You do not have permission to issue this command!');
            } else {
                reject('Unable to retrieve message author! Can\'t check permissions');
            }
        });
    }
}
export type TriggerCallback = (message: Message) => void;
export type TriggerCondition = (
    message: Message,
    options?: TriggerOptions
) => Promise<void>;