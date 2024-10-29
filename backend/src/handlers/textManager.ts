import { PROGRESS_BAR_SETTINGS, WAR_START_INTERVAL } from '../common/constant';
import { TimingsSettings } from '../common/settings/timings.settings';
import { WarInfo } from '../common/types';
import Database from '../db/database';
import { clamp } from '../util/util.generic';
import { Widget } from '../widget';
import { Manager, Subscriber, TimeInfo, UnsubscribeReason } from './manager';

class TextManager extends Manager {
	public update(subscribers: (Subscriber & TimeInfo)[]): void {
		subscribers.forEach(
			async ({ time: { subscribedForMs }, warEnd, widget, dbGuild: { id, customTimings } }) => {
				// If widget doesn't exist, unsubscribe
				if (!widget) {
					this.unsubscribe(id, 'No Widget', widget);
					return;
				}

				const minutesSubscribed = subscribedForMs / 1000 / 60;

				if (widget.textState && warEnd && minutesSubscribed >= WAR_START_INTERVAL / 2) {
					this.unsubscribe(id, 'War End', widget);
					return;
				}

				const respawnData = customTimings
					? TimingsSettings.convertToRespawnData(TimingsSettings.convertToSeconds(customTimings)!)
					: TimingsSettings.convertToRespawnData(
							TimingsSettings.convertToSeconds(TimingsSettings.DEFAULT)!
						);
				const description = this.getDescription(respawnData);
				await widget.update({ description });
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
	public async unsubscribe(
		guildId: string,
		reason?: UnsubscribeReason | undefined,
		widget?: Widget
	): Promise<void> {
		widget = widget ?? (await Widget.find(await Database.getGuild(guildId)));
		if (widget) {
			widget.textState = false;
			widget.update({ force: true });
		}
		return super.unsubscribe(guildId, reason);
	}
	private getDescription(info: WarInfo): string {
		const timeLeftMinutes = Math.floor(info.war.timeLeftSeconds / 60);
		const timeLeftSeconds = info.war.timeLeftSeconds % 60;
		const bar = this.getBar(info.respawn.duration, info.respawn.timeUntilRespawn);

		const title = this.getTitle(info.respawn.remainingRespawns, info.respawn.timeUntilRespawn);
		const barSection = bar ? `### ${bar}\n\n` : '';
		const respawnDuration = info.respawn.duration >= 0 ? info.respawn.duration : '-';
		const nextRespawnDuration = info.respawn.durationNext >= 0 ? info.respawn.durationNext : '-';
		const nextRespawnIndicator = info.respawn.durationNext > info.respawn.duration ? ' ⬆️' : '';
		const remainingRespawns = info.respawn.remainingRespawns;
		const formattedTimeLeft = `${timeLeftMinutes > 9 ? timeLeftMinutes : '0' + timeLeftMinutes}:${
			timeLeftSeconds > 9 ? timeLeftSeconds : '0' + timeLeftSeconds
		}`;

		return (
			`# ${title}\n` +
			`${barSection}` +
			`*This Respawn Duration*: **${respawnDuration}**  \n` +
			`*Next Respawn Duration*: **${nextRespawnDuration}**${nextRespawnIndicator}  \n` +
			`*Respawns Remaining*: **${remainingRespawns}**  \n` +
			`*Time Remaining*: **${formattedTimeLeft}**`
		);
	}
	private getBar(timeTotal: number, timeLeft: number): string {
		if (timeLeft < 0) return '';

		const progress = Math.round(
			PROGRESS_BAR_SETTINGS.barWidth * ((timeTotal - timeLeft) / timeTotal)
		);
		const filledBar = PROGRESS_BAR_SETTINGS.barIconFull.repeat(
			clamp(progress, 0, PROGRESS_BAR_SETTINGS.barWidth)
		);
		const emptyBar = PROGRESS_BAR_SETTINGS.barIconEmpty.repeat(
			clamp(PROGRESS_BAR_SETTINGS.barWidth - progress, 0, PROGRESS_BAR_SETTINGS.barWidth)
		);

		return `[${filledBar}${emptyBar}]`;
	}
	private getTitle(remainingRespawns: number, timeLeft: number): string {
		let respawn: string;

		if (remainingRespawns === 0) {
			respawn = 'NO MORE RESPAWNS';
		} else if (timeLeft <= 0) {
			respawn = 'RESPAWN';
		} else {
			respawn = timeLeft.toString();
		}

		const icon = timeLeft === 0 ? '🔶' : '🔸';
		return `${icon} ${respawn}`;
	}
}
export default new TextManager();
