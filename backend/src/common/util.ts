import { User } from 'discord.js';
import { dynamicConfig } from './dynamic-config';
import { Trigger } from './types';

const includesArg = (arg: string): boolean => {
    return !!process.argv.find((a: string) => [arg, `-${arg}`, `--${arg}`].includes(a));
};

export const production = ((): boolean => {
    return process.env.NODE_ENV === 'prod';
})();
export const debug = ((): boolean => {
    return includesArg('debug');
})();
export const logging = ((): boolean => {
    return includesArg('logging');
})();
export const getSampleTriggerCommand = (trigger: Trigger, options?: {
    includeMentions?: User[];
}): string => {
    const commandOptions = trigger.options?.commandOptions;
    const mentions = options?.includeMentions ?
        options.includeMentions.map((user) => user.toString()).join(' ') :
        '';
    if (commandOptions) {
        const prefix = commandOptions.ignorePrefix ? '' : dynamicConfig.commandPrefix;
        return `${prefix}${commandOptions.command} ${mentions}`;
    } else {
        const rnd = [...Array(10)].map(() => Math.random().toString(36)[2]).join('');
        return `${rnd} ${mentions}`;
    }
};
