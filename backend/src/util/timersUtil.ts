import { WarInfo } from '../common/types';

export const getRespawnInfo = (timers: number[]): WarInfo => {
    const start = new Date();
    start.setMinutes(start.getMinutes() >= 30 ? 30 : 0);
    start.setSeconds(0);
    start.setMilliseconds(0);
    const now = new Date();

    const timePassedSeconds = Math.round((now.getTime() - start.getTime()) / 1000);
    let timestampIndex = -1;
    for (let index = 0; index < timers.length; index++) {
        if (timePassedSeconds > timers[index]) {
            timestampIndex = index;
        }
    }

    const respawnTimestamp = timers[timestampIndex + 1] ?
        timers[timestampIndex + 1] : -1;
    const timeTotal = timers[timestampIndex + 1] ?
        timers[timestampIndex + 1] - timers[timestampIndex] : -1;
    const timeTotalNext = timers[timestampIndex + 2] ?
        timers[timestampIndex + 2] - timers[timestampIndex + 1] : -1;
    const remainingRespawns = timers.length - 1 - timestampIndex;
    const timeLeftTotalSeconds = 30 * 60 - timePassedSeconds;

    const clamp = (val: number, min: number, max: number): number => {
        return val > max ? max : val < min ? min : val;
    };

    return {
        respawn: {
            duration: timeTotal,
            durationNext: timeTotalNext,
            timeUntilRespawn: clamp(respawnTimestamp - timePassedSeconds, 0, Infinity),
            remainingRespawns: remainingRespawns
        },
        war: {
            timeLeftSeconds: timeLeftTotalSeconds
        }
    };
};
