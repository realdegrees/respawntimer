import { EmojiResolvable } from 'discord.js';
import logger from '../../lib/logger';
import { timers as timestamps } from './timer';

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
export const getRespawnInfo = (): {
    timeToRespawn: number;
    currRespawnTimer: number;
    nextRespawnTimer: number;
    remainingRespawns: number;
} => {
    const start = new Date();
    start.setMinutes(start.getMinutes() >= 30 ? 30 : 0);
    start.setSeconds(0);
    start.setMilliseconds(0);
    const current = new Date();

    const timePassedSeconds = Math.round((current.getTime() - start.getTime()) / 1000);
    let timestampIndex = 0;
    for (let index = 0; index < timestamps.length; index++) {
        if (timePassedSeconds > timestamps[index]) {
            timestampIndex = index;
        }
    }

    const respawnTimestamp = timestamps[timestampIndex + 1] ?
        timestamps[timestampIndex + 1] : -1;
    const currRespawnTimer = timestamps[timestampIndex + 1] ?
        timestamps[timestampIndex + 1] - timestamps[timestampIndex] : -1;
    const nextRespawnTimer = timestamps[timestampIndex + 2] ?
        timestamps[timestampIndex + 2] - timestamps[timestampIndex + 1] : -1;
    const remainingRespawns = timestamps.length - 1 - timestampIndex;

    return {
        timeToRespawn: respawnTimestamp - timePassedSeconds,
        currRespawnTimer,
        nextRespawnTimer,
        remainingRespawns
    };
};
export const clamp = (val: number, min: number, max: number): number => {
    return val > max ? max : val < min ? min : val;
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

export const escapeRegex = (text: string): string => {
    return text.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
};

export const mock = (text: string): string => {
    return text.split('').map((char, index) =>
        index % 2 === 0 ?
            char.toUpperCase() :
            char.toLowerCase()
    ).join('');
};

/** requires number between 0 and 1 */
export const executeWithChance = <T>(chance: number, callback: () => T): T | undefined => {
    const rnd = Math.random();
    if (chance > rnd) {
        return callback();
    }
};

export const shuffle = <T extends unknown[]>(arr: T): T => {
    let j, temp;
    for (let i = arr.length - 1; i > 0; i--) {
        j = Math.floor(Math.random() * (i + 1));
        temp = arr[j];
        arr[j] = arr[i];
        arr[i] = temp;
    }
    return arr;
};

export const unicodeEmojiAlphabet = (): EmojiResolvable[] => {
    const unicodeA = 0x1F1E6;
    return [...Array(26).keys()]
        .map((value) => value + unicodeA)
        .map((codepoint) => String.fromCodePoint(codepoint));
};