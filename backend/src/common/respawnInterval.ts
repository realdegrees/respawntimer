import audioManager from '../audioManager';
import applicationSettings from './applicationSettings';
import { timers } from './timer';
import { clamp, getRespawnInfo } from './util';

const settings = {
    barWidth: 25,
    barIconFull: '●',
    barIconEmpty: '○'
};
let subscribers: {
    timeStamp: number;
    id: string;
    guildId: string;
    text: boolean;
    cb: (title: string, description: string) => Promise<void>;
    onEnd: () => void;
    onUnsubscribe: () => void;
}[] = [];

class RespawnInterval {
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


        subscribers.forEach((subscriber) => {
            // Toggle widget & voice off at war end if it's been on for more than 15 minutes
            if (data.timeLeftTotalSeconds < 5) {
                const minutesSubscribed = new Date(Date.now() - subscriber.timeStamp).getMinutes();
                if (minutesSubscribed >= 15) {
                    subscriber.onEnd();
                }
            }
        });

        if (data.timeLeftTotalSeconds === 1800 - 2) {
            audioManager.playStart();
        }

        // Audioplayer only plays at the second marks provided by available sound files
        // Skip any announcements higher than 50% of the total time 
        if (data.timeLeft / data.timeTotal < 0.50 && data.remainingRespawns > 0) {
            audioManager.playCountdown(data.timeLeft);
        }
        if (data.remainingRespawns <= 5 && data.timeTotal - data.timeLeft === 2) {
            audioManager.playRespawnCount(data.remainingRespawns);
        }
        if (data.remainingRespawns === 0 && 1800 - timers[timers.length - 1] - data.timeLeftTotalSeconds === 5) {
            // Plays last respawn sound
            audioManager.playRespawnCount(0);
        }

        // Updat text for text subs
        subscribers.filter((s) => s.text).forEach((subscriber) => {
            // Update delay > 10 seconds is decided by the settings, 
            // Under 10 seconds it's in 2s steps and under 5s it's 1s steps
            if (
                data.timeLeft % applicationSettings.get(subscriber.guildId).delay !== 0 ||
                data.remainingRespawns === 0 &&
                new Date().getSeconds() % applicationSettings.get(subscriber.guildId).delay !== 0
            ) {
                return;
            }
            subscriber.cb(title, description);
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
        onEnd: () => void,
        onUnsubscribe: () => void
    ): void {
        if (subscribers.find((s) => s.id === id)) {
            return;
        }
        const existingGuildSubscriber = subscribers.find((s) => s.guildId === guildId);
        if (existingGuildSubscriber) {
            this.unsubscribeQueue.push(existingGuildSubscriber.id);
        }
        const timeStamp = Date.now();
        subscribers.push({
            timeStamp,
            id,
            guildId,
            text: false,
            cb,
            onEnd,
            onUnsubscribe
        });
    }
    public enableText(id: string): void {
        const sub = subscribers.find((s) => s.id === id);
        if (sub) {
            sub.text = true;
        }
    }

    public disableText(id: string): void {
        const sub = subscribers.find((s) => s.id === id);
        if (sub) {
            sub.text = false;
        }
    }


    public unsubscribe(id: string, skipCallback = false): boolean {
        const subscriber = subscribers.find((subscriber) => subscriber.id === id);
        if (!subscriber) {
            return false;
        }
        subscribers = subscribers.filter((subscriber) => subscriber.id !== id);
        if (!skipCallback) {
            subscriber.onUnsubscribe();
        }
        return true;
    }
    public updateSubscription(oldId: string, newId: string): void {
        const sub = subscribers.find((s) => s.id === oldId);
        if (sub) {
            sub.id = newId;
        }
    }
}
export default new RespawnInterval();