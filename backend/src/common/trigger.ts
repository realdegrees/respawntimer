import { Message, GuildMember } from 'discord.js';
import { dynamicConfig } from './dynamic-config';
import { TriggerMatch } from './types';
import { TriggerOptions, CommandOptions } from './types/trigger-options';
import logger from '../../lib/logger';

export class Trigger {
    /**
     * Creates a new Trigger that issues the callback when a message 
     * is sent that passes the conditions provided in the options param
     * @param callback The function to call when a message passing the conditions in options is sent
     * @param options If not provided, the callback will be triggered on every message
     */
    public constructor(public callback: TriggerCallback, private options?: TriggerOptions) {
        if (options?.commandOptions?.content.startsWith(dynamicConfig.commandPrefix)) {
            options.commandOptions.content.replace(dynamicConfig.commandPrefix, '');
            logger.warn(
                `The command in this Trigger 
                ${options.commandOptions.content} already contains the prefix!`,
                'It was automatically removed.');
        }
    }

    /**
     * Checks if this Trigger instance should issue its' 
     * callback based on the options provided in constructor
     * @param message 
     */
    public checkCondition(message: Message): Promise<boolean> {
        if (this.options?.commandOptions) {
            // Checks the default conditions with the provided commandOptions
            const command = `${dynamicConfig.commandPrefix}${this.options.commandOptions.content}`;
            const matchType = this.options.commandOptions.matchType;
            return new Promise<boolean>((resolve) => {
                switch (matchType) {
                    case TriggerMatch.CONTAINS:
                        resolve(message.content.includes(command));
                        break;
                    case TriggerMatch.EQUALS:
                        resolve(message.content === command);
                        break;
                    case TriggerMatch.STARTS_WITH:
                        resolve(message.content.startsWith(command));
                        break;
                }
            }).then((isAllowed) => {
                if (isAllowed && this.options?.conditionCheck) {
                    return this.options.conditionCheck(message, this.options.commandOptions);
                } else {
                    return false;
                }
            });
        } else {
            return Promise.resolve(true);
        }

    }
    /**
     * Checks if the provided member has the right to issue this command
     * Dictated by the commandOptions for this trigger
     * @param member 
     */
    public checkPermission(member: GuildMember | null): Promise<boolean> {
        return new Promise((resolve, reject) => {
            member ?
                resolve(
                    !this.options?.rolePermissions ||
                    this.options.rolePermissions.some(
                        (permission) => member.roles.cache.has(permission)
                    )) :
                reject('Unable to retrieve message author!');
        });
    }
}
export type TriggerCallback = (message: Message) => void;
export type TriggerCondition = (
    message: Message,
    commandOptions?: CommandOptions
) => Promise<boolean>;