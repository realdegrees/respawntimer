import logger from '../lib/logger';
import applicationSettings from './common/applicationSettings';
import { WarInfo } from './common/types';
import { clamp } from './common/util';

const settings = {
    barWidth: 25,
    barIconFull: '●',
    barIconEmpty: '○'
};

let subscribers: {
    timeStamp: number;
    msgId: string;
    guildId: string;
    onUpdate: (title: string, description: string) => Promise<void>;
    onUnsubscribe: () => void;
}[] = [];

class TextManager {

    public interval(info: WarInfo): void {
        const description = this.getDescription(info);
        const title = this.getTitle(info.respawn.remaining, info.respawn.timePassed);

        subscribers.forEach((subscriber) => {
            // Toggle widget & voice off at war end if it's been on for more than 15 minutes
            if (info.war.timeLeftSeconds === 5) {
                const minutesSubscribed = (Date.now() - subscriber.timeStamp) / 1000 / 60;
                if (minutesSubscribed >= 15) {
                    this.unsubscribe(subscriber.msgId);
                }
            }
        });

        // Updat text for text subs
        subscribers.forEach((subscriber) => {
            // Update delay > 10 seconds is decided by the settings, 
            // Under 10 seconds it's in 2s steps and under 5s it's 1s steps
            if (
                info.respawn.timePassed % applicationSettings.get(subscriber.guildId).delay !== 0 ||
                info.respawn.remaining === 0 &&
                new Date().getSeconds() % applicationSettings.get(subscriber.guildId).delay !== 0
            ) {
                return;
            }
            subscriber.onUpdate(title, description);
        });
    }
    private getDescription(info: WarInfo): string {
        const timeLeftMinutes = Math.floor(info.war.timeLeftSeconds / 60);
        const timeLeftSeconds = info.war.timeLeftSeconds - timeLeftMinutes * 60;

        return '**' +
            this.getBar(info.respawn.duration, info.respawn.timePassed) + '**\n\n' +
            'This Respawn Duration: **' + (info.respawn.duration >= 0 ? info.respawn.duration : '-') + '**\n' +
            'Next Respawn Duration: **' + (info.respawn.durationNext >= 0 ? info.respawn.durationNext : '-') + '**\n' +
            'Respawns Remaining: **' + info.respawn.remaining + '**\n' +
            'Time Remaining: **' + (timeLeftMinutes > 9 ? timeLeftMinutes : '0' + timeLeftMinutes) + ':' +
            (timeLeftSeconds > 9 ? timeLeftSeconds : '0' + timeLeftSeconds) + '**';
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
        msgId: string,
        guildId: string,
        onUpdate: (title: string, description: string) => Promise<void>,
        onUnsubscribe: () => void
    ): void {
        if (subscribers.find((s) => s.msgId === msgId)) {
            return;
        }
        const existingGuildSubscriber = subscribers.find((s) => s.guildId === guildId);
        if (existingGuildSubscriber) {
            this.unsubscribe(existingGuildSubscriber.msgId);
        }
        const timeStamp = Date.now();
        subscribers.push({
            timeStamp,
            msgId: msgId,
            guildId,
            onUpdate,
            onUnsubscribe
        });
    }
    public unsubscribe(msgId: string, skipCallback = false): boolean {
        const subscriber = subscribers.find((subscriber) => subscriber.msgId === msgId);
        if (!subscriber) {
            return false;
        }
        subscribers = subscribers.filter((subscriber) => subscriber.msgId !== msgId);
        if (!skipCallback) {
            subscriber.onUnsubscribe();
        }
        return true;
    }
    public updateSubscription(oldMsgId: string, newMsgId: string): boolean {
        const sub = subscribers.find((s) => s.msgId === oldMsgId);
        if (sub) {
            sub.msgId = newMsgId;
            return true;
        }
        return false;
    }
}
export default new TextManager();