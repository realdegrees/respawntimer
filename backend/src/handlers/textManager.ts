import logger from '../../lib/logger';
import { TimingsSettings } from '../common/settings/timings.settings';
import { WarInfo } from '../common/types';
import { clamp } from '../util/util.generic';
import { Widget } from '../widget';

const settings = {
    barWidth: 25,
    barIconFull: '●',
    barIconEmpty: '○'
};

// TODO make textmanager static along with voicemanager
type Subscriber = {
    widget: Widget;
    timings?: number[];
    update: (options?: {
        title?: string;
        description?: string;
        force?: boolean;
    }) => Promise<unknown>;
    timeStamp?: number;
};
class TextManager {
    private subscribers: Subscriber[] = [];
    public interval(): void {
        if (this.subscribers.length === 0) return;
        this.subscribers.forEach((subscriber) => {
            const date = new Date();
            const [minutes, seconds] = [date.getMinutes(), date.getSeconds()];
            const minutesSubscribed = subscriber.timeStamp ? new Date(date.getTime() - subscriber.timeStamp).getTime() / 1000 / 60 : 0;

            // Toggle widget off at war end if it's been on for more than 15 minutes
            // Toggle widget off if it's been subscribed for over 45 minutes
            const widgetHasTextEnabled = subscriber.widget.getTextState();
            const isEndOfwar = (minutes === 59 || minutes === 29) && seconds === 30 && (minutesSubscribed >= 15 || minutesSubscribed >= 45);
            if (widgetHasTextEnabled && isEndOfwar) {
                subscriber.widget.toggleText().catch(logger.error);
                logger.debug('Auto-stop widget');
            }
        });

        const defaultRespawnData = TimingsSettings.convertToRespawnData(TimingsSettings.convertToSeconds(TimingsSettings.DEFAULT)!);
        const customSubscribers = this.subscribers.filter((s) => !!s.timings);
        const defaultSubscribers = this.subscribers.filter((s) => !s.timings);

        for (const subscriber of customSubscribers) {
            const respawnData = subscriber.timings ? TimingsSettings.convertToRespawnData(subscriber.timings) : defaultRespawnData;
            this.handleSubscriber(subscriber, respawnData);
        }

        for (const subscriber of defaultSubscribers) {
            this.handleSubscriber(subscriber, defaultRespawnData);
        }
    }
    private async handleSubscriber(subscriber: Subscriber, respawnData: WarInfo): Promise<void> {
        if (!subscriber.widget.getTextState()) {
            subscriber.timeStamp = undefined;
            return;
        }
        if(!subscriber.timeStamp){
            subscriber.timeStamp = Date.now();
        }
        const description = this.getDescription(respawnData);
        await subscriber.update({ description })
            .catch(logger.error);
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
        const subscriber = this.subscribers.find((s) => s.widget.guild.id === guildId);
        if (!subscriber) return;
        const timingsList = TimingsSettings.convertToSeconds(timings);
        subscriber.timings = timingsList;
    }
    public resetTimings(guildId: string): void {
        const subscriber = this.subscribers.find((s) => s.widget.guild.id === guildId);
        if (!subscriber?.timings) return;
        subscriber.timings = undefined;
    }

    public subscribe(options: {
        widget: Widget;
        customTimings?: string;
    }, update: (options?: {
        title?: string;
        description?: string;
        force?: boolean;
    }) => Promise<unknown>
    ): void {
        if (this.subscribers.find((s) => s.widget.getId() === options.widget.getId())) {
            return;
        }
        const existingGuildSubscriber = this.subscribers.find((s) => s.widget.getId() === options.widget.guild.id);
        if (existingGuildSubscriber) {
            this.unsubscribe(existingGuildSubscriber.widget.getId());
        };

        const timings = TimingsSettings.convertToSeconds(options.customTimings ?? '');

        const timeStamp = Date.now();
        this.subscribers.push({
            widget: options.widget,
            timings,
            update
        });
    }
    public unsubscribe(msgId: string, skipCallback = false): boolean {
        const subscriber = this.subscribers.find((subscriber) => subscriber.widget.getId() === msgId);
        if (!subscriber) {
            return false;
        }
        this.subscribers = this.subscribers.filter((subscriber) => subscriber.widget.getId() !== msgId);
        return true;
    }
}
export default new TextManager();