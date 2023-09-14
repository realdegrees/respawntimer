import logger from '../../lib/logger';
import { TimingsSettings } from '../common/settings/timings.settings';
import { WarInfo } from '../common/types';
import { clamp } from './util.generic';

const settings = {
    barWidth: 25,
    barIconFull: '●',
    barIconEmpty: '○'
};


type Subscriber = {
    timeStamp: number;
    msgId: string;
    guildId: string;
    timings?: number[];
    onUpdate: (title?: string, description?: string) => Promise<boolean>;
    onInitialize?: () => void;
    onUnsubscribe: () => void;
};
class TextManager {
    private subscribers: Subscriber[] = [];
    public interval(): void {
        if (this.subscribers.length === 0) return;
        this.subscribers.forEach((subscriber) => {
            const date = new Date();
            const [minutes, seconds] = [date.getMinutes(), date.getSeconds()];
            const minutesSubscribed = new Date(date.getTime() - subscriber.timeStamp).getTime() / 1000 / 60;

            // Toggle widget off at war end if it's been on for more than 15 minutes
            // Toggle widget off if it's been subscribed for over 45 minutes
            if ((minutes === 59 || minutes === 29) && seconds === 59 && minutesSubscribed >= 15 || minutesSubscribed >= 45) {
                this.unsubscribe(subscriber.msgId);
            }
        });

        const defaultRespawnData = TimingsSettings.convertToRespawnData(TimingsSettings.convertToSeconds(TimingsSettings.DEFAULT)!);
        const customSubscribers = this.subscribers.filter((s) => !!s.timings);
        const defaultSusbcribers = this.subscribers.filter((s) => !s.timings);

        customSubscribers.forEach((subscriber) => {
            this.handleSubscriber(subscriber, subscriber.timings ?
                TimingsSettings.convertToRespawnData(subscriber.timings) :
                defaultRespawnData);
        });
        defaultSusbcribers.forEach((subscriber) => {
            this.handleSubscriber(subscriber, defaultRespawnData);
        });
    }
    private async handleSubscriber(subscriber: Subscriber, respawnData: WarInfo): Promise<void> {
        const description = this.getDescription(respawnData);

        if (!subscriber.onInitialize && respawnData.respawn.timeUntilRespawn % 1 !== 0) return Promise.resolve();
        return subscriber.onUpdate('', description)
            .then(() => {
                if (subscriber.onInitialize) {
                    subscriber.onInitialize();
                    subscriber.onInitialize = undefined;
                }
            }).catch(logger.error);
    }
    private getDescription(info: WarInfo): string {
        const timeLeftMinutes = Math.floor(info.war.timeLeftSeconds / 60);
        const timeLeftSeconds = info.war.timeLeftSeconds - timeLeftMinutes * 60;
        const bar = this.getBar(info.respawn.duration, info.respawn.timeUntilRespawn);

        return `# ${this.getTitle(info.respawn.remainingRespawns, info.respawn.timeUntilRespawn)}\n` +
            `${bar ? `### ${bar}\n\n` : ''}
            *This Respawn Duration*: **${info.respawn.duration >= 0 ? info.respawn.duration : '-'}**  
            *Next Respawn Duration*: **${info.respawn.durationNext >= 0 ? info.respawn.durationNext : '-'}**${info.respawn.durationNext > info.respawn.duration ? ' ⬆️' : ''}  
            *Respawns Remaining*: **${info.respawn.remainingRespawns}**  
            *Time Remaining*: **${timeLeftMinutes > 9 ? timeLeftMinutes : '0' + timeLeftMinutes}:${timeLeftSeconds > 9 ? timeLeftSeconds : '0' + timeLeftSeconds}**`;
    }
    private getBar(timeTotal: number, timeLeft: number): string {
        const progress = Math.round(settings.barWidth * ((timeTotal - timeLeft) / timeTotal));
        return timeLeft < 0 ? '' : '[' +
            settings.barIconFull.repeat(clamp(progress, 0, settings.barWidth)) +
            settings.barIconEmpty.repeat(clamp(settings.barWidth - progress, 0, settings.barWidth)) +
            ']';
    }
    private getTitle(remainingRespawns: number, timeLeft: number): string {
        const respawn = remainingRespawns === 0 ? 'NO MORE RESPAWNS' : timeLeft <= 0 ? 'RESPAWN' : timeLeft.toString();
        return `${timeLeft === 0 ? '🔶' : '🔸'} ` + respawn;
    }
    public setTimings(guildId: string, timings: string): void {
        const subscriber = this.subscribers.find((s) => s.guildId === guildId);
        if (!subscriber) return;
        const timingsList = TimingsSettings.convertToSeconds(timings);
        subscriber.timings = timingsList;
    }
    public resetTimings(guildId: string): void {
        const subscriber = this.subscribers.find((s) => s.guildId === guildId);
        if (!subscriber?.timings) return;
        subscriber.timings = undefined;
    }

    public subscribe(options: {
        msgId: string;
        guildId: string;
        customTimings?: string;
    }, onUpdate: (title?: string, description?: string) => Promise<boolean>,
        onInitialize: () => void,
        onUnsubscribe: () => void
    ): void {
        if (this.subscribers.find((s) => s.msgId === options.msgId)) {
            return;
        }
        const existingGuildSubscriber = this.subscribers.find((s) => s.guildId === options.guildId);
        if (existingGuildSubscriber) {
            this.unsubscribe(existingGuildSubscriber.msgId);
        }

        const timings = TimingsSettings.convertToSeconds(options.customTimings ?? '');

        const timeStamp = Date.now();
        this.subscribers.push({
            timeStamp,
            msgId: options.msgId,
            guildId: options.guildId,
            timings,
            onUpdate,
            onInitialize,
            onUnsubscribe
        });
    }
    public unsubscribe(msgId: string, skipCallback = false): boolean {
        const subscriber = this.subscribers.find((subscriber) => subscriber.msgId === msgId);
        if (!subscriber) {
            return false;
        }
        this.subscribers = this.subscribers.filter((subscriber) => subscriber.msgId !== msgId);
        if (!skipCallback) {
            subscriber.onUnsubscribe();
        }
        return true;
    }
    public updateSubscription(oldMsgId: string, newMsgId: string): void {
        const sub = this.subscribers.find((s) => s.msgId === oldMsgId);
        if (sub) {
            sub.msgId = newMsgId;
        }
    }
}
export default new TextManager();