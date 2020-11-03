import { settings } from 'cluster';
import { Guild, Message, User } from 'discord.js';
import { config } from 'dotenv/types';
import Firebase from '../../lib/firebase';
import { GuildSettings, Trigger } from './types';

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
export const getSampleTriggerCommand = (
    trigger: Trigger,
    guild: Guild,
    options?: {
        subTrigger?: string;
        includeMentions?: User[];
    }
): Promise<string> => {
    return new Promise((resolve, reject) => {
        const commandOptions = trigger.options?.commandOptions;
        const mentions = options?.includeMentions ?
            options.includeMentions.map((user) => user.toString()).join(' ') :
            '';
        if (commandOptions?.command.length && commandOptions.command.length > 0) {
            if (!commandOptions.ignorePrefix) {
                fetchPrefix(guild.id, trigger.db)
                    .then((prefix) =>
                        resolve(
                            prefix +
                            [
                                commandOptions.command[0],
                                options?.subTrigger,
                                mentions
                            ]
                                .join(' ')
                                .replace(/\s{2,}/g, ' ').trim()
                        )
                    )
                    .catch(reject);
            } else {
                resolve(
                    [
                        commandOptions.command[0],
                        options?.subTrigger,
                        mentions
                    ]
                        .join(' ')
                        .replace(/\s{2,}/g, ' ').trim()
                );
            }
        } else {
            const rnd = [...Array(10)].map(() => Math.random().toString(36)[2]).join('');
            resolve(`${rnd} ${mentions}`);
        }
    });
};
export const reflectVariables = (
    // eslint-disable-next-line @typescript-eslint/ban-types
    object: object,
    vars: {
        [key: string]: unknown;
    }
): void => {
    Object.entries(vars).forEach(([key, value]) => {
        Reflect.set(object, key, value);
    });
};
export const fetchPrefix = (guildId: string, db: Firebase): Promise<string> =>
    db.firestore.get<GuildSettings>([
        guildId,
        'config'
    ].join('/'))
        .then((settings) => {
            if (!settings) {
                return db.firestore.store<GuildSettings>({
                    prefix: '!'
                }, [
                    guildId,
                    'config'
                ].join('/')).then(() => '!');
            } else {
                return settings.prefix;
            }
        });

export const escapeRegex = (text: string): string => {
    return text.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
};