import { TriggerMatch } from './trigger-match';
import { TriggerCondition } from '../trigger';
import { BitFieldResolvable, PermissionString } from 'discord.js';

export interface TriggerOptions {
    commandOptions?: CommandOptions;
    /** The channels that should be exlcuded/included from the command 
     * Must use channelIds
     */
    channels?: {
        /** If this is set, the trigger will only run in the specified channels */
        include?: string[];
        /** All channels to be exlcuded from this trigger (Overwrites "include") */
        exclude?: string[];
    };
    /**
     * A list of roles that are allowed to issue this command
     */
    roles?: {
        /** If this is set, the trigger will be ignored 
         * if the author does not have one of the specified roles*/
        include?: string[];
        /** All roles that are prohibited from using this trigger (Overwrites "include") */
        exclude?: string[];
    }; // TODO: Add runtime check to see if all given roles are available on the server
    /** The permission(s) required to trigger */
    requiredPermissions?: BitFieldResolvable<PermissionString>[];
    /**
     * A custom condition check to determine if the command 
     * written by the user will trigger a bot response or not
     */
    conditionCheck?: TriggerCondition;
}
// TODO: Add 'triggerType' in order to create triggers 
// TODO: for different events like guildJoined or channelJoined etc.
export interface CommandOptions {
    /** The command that a user needs to write to trigger the bot */
    command: string;
    /** Determines e.g. if the command *must* be the first text in the message or not */
    match: TriggerMatch;
    /** Should the bot trigger on 'content' even if the bot prefix is not provided?
     *  Defaults to 'false'
     */
    ignorePrefix?: boolean;
}