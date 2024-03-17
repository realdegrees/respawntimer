import { TimingsSettings } from '../common/settings/timings.settings';
import { WarInfo } from '../common/types';
import Database from '../db/database';
import { clamp } from '../util/util.generic';
import { Widget } from '../widget';
import { Manager, Subscriber, TimeInfo, UnsubscribeReason } from './manager';

const settings = {
	barWidth: 25,
	barIconFull: '●',
	barIconEmpty: '○'
};

class TextManager extends Manager {
	public update(subscribers: (Subscriber & TimeInfo)[]): void {
		subscribers.forEach(
			async ({ time: { subscribedForMs }, warEnd, widget, dbGuild: { id, customTimings } }) => {
				// If widget doesn't exist, unsubscribe
				if (!widget) {
					this.unsubscribe(id, 'No Widget');
					return;
				}

				const minutesSubscribed = subscribedForMs / 1000 / 60;

				if (widget.textState && warEnd && minutesSubscribed >= 15) {
					this.unsubscribe(id, 'War End');
					widget.textState = false;
					await widget.update({ force: true });
					return;
				}

				const respawnData = customTimings
					? TimingsSettings.convertToRespawnData(TimingsSettings.convertToSeconds(customTimings)!)
					: TimingsSettings.convertToRespawnData(
							TimingsSettings.convertToSeconds(TimingsSettings.DEFAULT)!
					  );
				const description = this.getDescription(respawnData);
				widget.update({ description });
			}
		);
	}
	public async subscribe(guildId: string): Promise<() => Promise<void>> {
		const dbGuild = await Database.getGuild(guildId);
		const widget = await Widget.find(dbGuild);

		if (widget) {
			widget.textState = true;
		}
		
		return super.subscribe(guildId);
	}
	public async unsubscribe(guildId: string, reason?: UnsubscribeReason | undefined): Promise<void> {
		const dbGuild = await Database.getGuild(guildId);
		const widget = await Widget.find(dbGuild);
		if (widget) {
			widget.textState = false;
			widget.update({ force: true });
		}
		return super.unsubscribe(guildId, reason);
	}
	private getDescription(info: WarInfo): string {
		const timeLeftMinutes = Math.floor(info.war.timeLeftSeconds / 60);
		const timeLeftSeconds = info.war.timeLeftSeconds - timeLeftMinutes * 60;
		const bar = this.getBar(info.respawn.duration, info.respawn.timeUntilRespawn);

		return (
			`# ${this.getTitle(info.respawn.remainingRespawns, info.respawn.timeUntilRespawn)}\n` +
			`${bar ? `### ${bar}\n\n` : ''}
            *This Respawn Duration*: **${
							info.respawn.duration >= 0 ? info.respawn.duration : '-'
						}**  
            *Next Respawn Duration*: **${
							info.respawn.durationNext >= 0 ? info.respawn.durationNext : '-'
						}**${info.respawn.durationNext > info.respawn.duration ? ' ⬆️' : ''}  
            *Respawns Remaining*: **${info.respawn.remainingRespawns}**  
            *Time Remaining*: **${timeLeftMinutes > 9 ? timeLeftMinutes : '0' + timeLeftMinutes}:${
				timeLeftSeconds > 9 ? timeLeftSeconds : '0' + timeLeftSeconds
			}**`
		);
	}
	private getBar(timeTotal: number, timeLeft: number): string {
		const progress = Math.round(settings.barWidth * ((timeTotal - timeLeft) / timeTotal));
		return timeLeft < 0
			? ''
			: '[' +
					settings.barIconFull.repeat(clamp(progress, 0, settings.barWidth)) +
					settings.barIconEmpty.repeat(clamp(settings.barWidth - progress, 0, settings.barWidth)) +
					']';
	}
	private getTitle(remainingRespawns: number, timeLeft: number): string {
		const respawn =
			remainingRespawns === 0
				? 'NO MORE RESPAWNS'
				: timeLeft <= 0
				? 'RESPAWN'
				: timeLeft.toString();
		return `${timeLeft === 0 ? '🔶' : '🔸'} ` + respawn;
	}
}
export default new TextManager();
