import { TriggerMatch } from './trigger-match';
import { TriggerCondition } from '../trigger';

export interface TriggerOptions {
    commandOptions?: CommandOptions;
    /** The channels that should be exlcuded/included from the command 
     * Must use channelIds
     */
    channels?: {
        include?: string[];
        exclude?: string[];
    };
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
// TODO: Add 'ignorePrefix' option
export interface CommandOptions {
    /** The command that a user needs to write to trigger the bot */
    command: string;
    /** Determines e.g. if the command *must* be the first text in the message or not */
    match: TriggerMatch;
    /** Should the bot trigger on 'content' even if the bot prefix is not provided? */
    ignorePrefix?: TriggerMatch;
}