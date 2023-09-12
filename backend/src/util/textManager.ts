import logger from '../../lib/logger';
import { WarInfo } from '../common/types';
import { clamp } from './util';

const settings = {
    barWidth: 25,
    barIconFull: '●',
    barIconEmpty: '○'
};

let subscribers: {
    timeStamp: number;
    msgId: string;
    guildId: string;
    onUpdate: (title: string, description: string) => Promise<boolean>;
    onInitialize?: () => void;
    onUnsubscribe: () => void;
}[] = [];

class TextManager {

    public interval(info: WarInfo): void {
        const description = this.getDescription(info);
        const title = this.getTitle(info.respawn.remaining, info.respawn.timeUntilRespawn);

        subscribers.forEach((subscriber) => {
            const minutesSubscribed = (Date.now() - subscriber.timeStamp) / 1000 / 60;
            if (info.war.timeLeftSeconds <= 30 && minutesSubscribed >= 15 || // Toggle widget off at war end if it's been on for more than 15 minutes
                minutesSubscribed > 30) { // Toggle widget off if it's been subscribed for over 30 minutes
                this.unsubscribe(subscriber.msgId);
            }
        });

        // logger.log(JSON.stringify(info.respawn));
        // Updat text for text subs
        subscribers.forEach((subscriber) => {
            if (!subscriber.onInitialize && info.respawn.timeUntilRespawn % 1 !== 0) return;
            subscriber.onUpdate(title, description).then(() => {
                if (subscriber.onInitialize) {
                    subscriber.onInitialize();
                    subscriber.onInitialize = undefined;
                }
            });
        });
    }
    private getDescription(info: WarInfo): string {
        const timeLeftMinutes = Math.floor(info.war.timeLeftSeconds / 60);
        const timeLeftSeconds = info.war.timeLeftSeconds - timeLeftMinutes * 60;

        return '**' +
            this.getBar(info.respawn.duration, info.respawn.timeUntilRespawn) + '**\n\n' +
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
        return 'ᐳ '.concat(respawn, spaces);
    }

    public subscribe(
        msgId: string,
        guildId: string,
        onUpdate: (title: string, description: string) => Promise<boolean>,
        onInitialize: () => void,
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
            onInitialize,
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