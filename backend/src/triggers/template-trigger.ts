/* eslint-disable @typescript-eslint/no-unused-vars */
import { Trigger, TriggerMatch } from '../common/types';
import { templateReaction } from '../reactions/template-reaction';

export const templateTrigger: Trigger = new Trigger(
    templateReaction, {
    commandOptions: {
        command: 'template',
        match: TriggerMatch.EQUALS,
        ignorePrefix: false // Defaults to false
    },
    channels: {
        exclude: ['aChannelWhereThisTriggerIsIgnored'],
        include: ['aChannelWhereThisTriggerIsAllowed']
    },
    requiredPermissions: ['MANAGE_GUILD'], // Any discord permission
    roles: {
        include: ['roleThatIsAllowedToRunThisTrigger'],
        exclude: ['roleThatIsNotAllowedToRunThisTrigger'],
    },
    conditionCheck: (message, options) => {
        // a custom condition check
        // example:
        return new Promise((resolve, reject) => {
            const timePosted = new Date(message.createdTimestamp);
            // If the command was written between 3pm and 9pm
            // the bot will answer, else the bot will ignore the command
            const isAllowed = timePosted.getHours() < 21 && timePosted.getHours() >= 3;
            return isAllowed ? resolve() : reject('I only answer between 3pm and 9pm');
        });
    }
});