import logger from '../../lib/logger';
import audioplayer from '../audioplayer';
import { getRespawnInfo } from './util';

const settings = {
    barWidth: 25,
    barIconFull: '■',
    barIconEmpty: '□'
};
let subscribers: {
    id: string;
    cb: (title: string, description: string) => void;
}[] = [];

class IntervalText {
    public constructor() {
        setInterval(this.interval.bind(this), 1000);
    }
    private interval(): void {
        const data = getRespawnInfo();
        const description = '**' +
            this.getBar(data.timeTotal, data.timeLeft) + '**\n\n' +
            'This Respawn Duration: **' + (data.timeTotal >= 0 ? data.timeTotal : '-') + '**\n' +
            'Next Respawn Duration: **' + (data.timeTotalNext >= 0 ? data.timeTotalNext : '-') + '**\n' +
            'Minutes Left in War: **' + data.timeLeftTotalMinutes + '**';
        const title = this.getTitle(data.remainingRespawns, data.timeLeft);

        // Audioplayer only plays at the second marks provided by available sound files
        // Skip any announcements higher than 35% of the total time 
        if(data.timeLeft / data.timeTotal < 0.65 && data.remainingRespawns > 0){
            audioplayer.play(data.timeLeft);
        }
        subscribers.forEach((subscriber) => {
            // Update subscribers but skip update every other second if timeLeft is alrger than 5
            if (data.timeLeft > 5 && data.timeLeft % 2 === 0) return;
            subscriber.cb(title, description);
        });
    }
    private getBar(timeTotal: number, timeLeft: number): string {
        const progress = Math.round(settings.barWidth * ((timeTotal - timeLeft) / timeTotal));
        return '**[' +
            settings.barIconFull.repeat(progress) +
            settings.barIconEmpty.repeat(settings.barWidth - progress) +
            ']**';
    }
    private getTitle(remainingRespawns: number, timeLeft: number): string {
        const respawn = remainingRespawns === 0 ? 'NO RESPAWN' : timeLeft <= 0 ? 'RESPAWN' : timeLeft.toString();
        const spaces = ' '.repeat(3 - timeLeft.toString().length);
        const info = remainingRespawns === 1 ? '(LAST RESPAWN)' : '';
        return 'ᐳ '.concat(respawn, spaces, info);
    }
    public subscribe(id: string, cb: (title: string, description: string) => void): (() => void) | undefined {
        if (subscribers.find((s) => s.id === id)) {
            return;
        }
        subscribers.push({
            id,
            cb
        });
        return () => {
            this.unsubscribe(id);
        };
    }
    public unsubscribe(id: string): void {
        subscribers = subscribers.filter((subscriber) => subscriber.id !== id);
    }
}
export default new IntervalText();