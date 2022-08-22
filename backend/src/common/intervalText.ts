import logger from '../../lib/logger';
import audioplayer from '../audioplayer';
import applicationSettings from './applicationSettings';
import { timers } from './timer';
import { clamp, getRespawnInfo } from './util';

const settings = {
    barWidth: 25,
    barIconFull: '■',
    barIconEmpty: '□'
};
let subscribers: {
    id: string;
    guildId: string;
    cb: (title: string, description: string) => Promise<void>;
    onUnsubscribe: () => void;
}[] = [];

class IntervalText {
    private unsubscribeQueue: string[] = [];
    public constructor() {
        setInterval(this.interval.bind(this), 1000);
    }
    private interval(): void {
        const data = getRespawnInfo();
        const timeLeftMinutes = Math.floor(data.timeLeftTotalSeconds / 60);
        const timeLeftSeconds = data.timeLeftTotalSeconds - timeLeftMinutes * 60;
        const description = '**' +
            this.getBar(data.timeTotal, data.timeLeft) + '**\n\n' +
            'This Respawn Duration: **' + (data.timeTotal >= 0 ? data.timeTotal : '-') + '**\n' +
            'Next Respawn Duration: **' + (data.timeTotalNext >= 0 ? data.timeTotalNext : '-') + '**\n' +
            'Respawns Remaining: **' + data.remainingRespawns + '**\n' +
            'Time Remaining: **' + (timeLeftMinutes > 9 ? timeLeftMinutes : '0' + timeLeftMinutes) + ':' +
            (timeLeftSeconds > 9 ? timeLeftSeconds : '0' + timeLeftSeconds) + '**';
        const title = this.getTitle(data.remainingRespawns, data.timeLeft);

        // Audioplayer only plays at the second marks provided by available sound files
        // Skip any announcements higher than 40% of the total time 
        if (data.timeLeft / data.timeTotal < 0.60 && data.remainingRespawns > 0) {
            audioplayer.playCountdown(data.timeLeft);
        }
        if (data.timeTotal - data.timeLeft === 3) {
            audioplayer.playRespawnCount(data.remainingRespawns);
        }
        if (data.remainingRespawns === 0 && 1800 - timers[timers.length - 1] - data.timeLeftTotalSeconds === 5){
            // Plays last respawn sound
            audioplayer.playRespawnCount(0);
        }
        subscribers.forEach(async (subscriber) => {
            // Update delay > 10 seconds is decided by the settings, 
            // Under 10 seconds it's in 2s steps and under 5s it's 1s steps
            if (
                data.timeLeft % applicationSettings.get(subscriber.guildId).delay !== 0 ||
                data.remainingRespawns === 0 &&
                new Date().getSeconds() % applicationSettings.get(subscriber.guildId).delay !== 0
            ) {
                return;
            }
            await subscriber.cb(title, description);
            this.unsubscribeQueue.forEach((id) => this.unsubscribe(id));
            this.unsubscribeQueue = [];
        });
    }
    private getBar(timeTotal: number, timeLeft: number): string {
        const progress = Math.round(settings.barWidth * ((timeTotal - timeLeft) / timeTotal));
        return '**[' +
            settings.barIconFull.repeat(clamp(progress, 0, settings.barWidth)) +
            settings.barIconEmpty.repeat(clamp(settings.barWidth - progress, 0, settings.barWidth)) +
            ']**';
    }
    private getTitle(remainingRespawns: number, timeLeft: number): string {
        const respawn = remainingRespawns === 0 ? 'NO RESPAWN' : timeLeft <= 0 ? 'RESPAWN' : timeLeft.toString();
        const spaces = ' '.repeat(3 - timeLeft.toString().length);
        const info = remainingRespawns === 1 ? '(LAST RESPAWN)' : '';
        return 'ᐳ '.concat(respawn, spaces, info);
    }
    public subscribe(
        id: string,
        guildId: string,
        cb: (title: string, description: string) => Promise<void>,
        onUnsubscribe: () => void
    ): (() => void) | undefined {
        if (subscribers.find((s) => s.id === id)) {
            return;
        }
        const existingGuildSubscriber = subscribers.find((s) => s.guildId === guildId);
        if (existingGuildSubscriber) {
            this.unsubscribeQueue.push(existingGuildSubscriber.id);
        }

        subscribers.push({
            id,
            cb,
            guildId,
            onUnsubscribe
        });
        return () => {
            this.unsubscribe(id);
        };
    }
    public unsubscribe(id: string, skipCallback = false): boolean {
        const subscriber = subscribers.find((subscriber) => subscriber.id === id);
        if (!subscriber) {
            return false;
        }
        subscribers = subscribers.filter((subscriber) => subscriber.id !== id);
        if (!skipCallback){
            subscriber.onUnsubscribe();
        }
        return true;
    }
    public updateSubscription(oldId: string, newId: string): void {
        const sub = subscribers.find((s) => s.id === oldId);
        if(sub){
            sub.id = newId;
        }
    }
}
export default new IntervalText();