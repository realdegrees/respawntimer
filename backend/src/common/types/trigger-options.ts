import { TriggerMatch } from './trigger-match';
import { TriggerCondition } from '../trigger';

// TODO: Add 'ignorePrefix' option
export interface TriggerOptions {
    commandOptions?: CommandOptions;
    /**
     * A list of roles that are allowed to issue this command
     */
    rolePermissions?: string[]; // TODO: Add runtime check to see if all given roles are available on the server
    /**
     * A custom condition check to determine if the command 
     * written by the user will trigger a bot response or not
     */
    conditionCheck?: TriggerCondition;
}
export interface CommandOptions {
    /**
     * The command that a user needs to write to trigger the bot
     */
    content: string;
    /**
     * Determines e.g. if the command *must* be the first text in the message or not
     */
    matchType?: TriggerMatch;
}