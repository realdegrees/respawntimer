import { setTimeout as promiseTimeout } from 'timers/promises';
import { RaidhelperAPIEvent, ScheduledEvent } from './common/types/raidhelperEvent';
import { Channel, Client, Colors, Guild, GuildBasedChannel } from 'discord.js';
import logger from '../lib/logger';
import { Widget } from './widget';
import audioManager from './handlers/audioManager';
import { NotificationHandler } from './handlers/notificationHandler';
import { DBGuild } from './common/types/dbGuild';
import Database from './db/database';
import { formatEvents } from './util/formatEvents';
import { RAIDHELPER_USER_ID } from './common/constant';
import { roundUpHalfHourUnix } from './util/formatTime';
import Bot from './bot';
import textManager from './handlers/textManager';
import { getEventVoiceChannel } from './util/discord';

const POLL_INTERVAL_MINUTES = .5;
const GRACE_PERIOD_MINUTES = 20; // Amount of time that events are checked in the past (e.g. if raidhelper is set to pre-war meeting time)

const activePollIntervals: Partial<
	Record<
		string,
		{
			retries: number;
		}
	>
> = {};

export class RaidhelperIntegration {
	public static startRaidhelperMessageCollector(): void {
		const messageCreateEvent = Bot.client.on('messageCreate', async (message) => {
			const guild = message.guild;

			if (message.author.id !== RAIDHELPER_USER_ID || message.type !== 20 || !guild) {
				return;
			}
			try {
				const dbGuild = await Database.getGuild(guild.id);
				if (dbGuild.raidHelper.apiKey) {
					await promiseTimeout(1000);
					await this.poll(dbGuild);
				}
			} catch (err) {
				logger.error(`[${guild.name}] Autopoll on messageCreate failed`);
			}
		});

		const messageDeleteEvent = Bot.client.on('messageDelete', async (message) => {
			const guild = message.guild;

			if (message.author?.id !== RAIDHELPER_USER_ID || message.type !== 0 || !guild) {
				return;
			}
			try {
				const dbGuild = await Database.getGuild(guild.id);
				if (dbGuild.raidHelper.apiKey) {
					await promiseTimeout(10000);
					await this.poll(dbGuild);
				}
			} catch (err) {
				logger.error(`[${guild.name}] Autopoll on messageDelete failed`);
			}
		});
	}
	public static start(dbGuild: DBGuild): void {
		if (!activePollIntervals[dbGuild.id]) {
			activePollIntervals[dbGuild.id] = { retries: 0 };
			this.poll(dbGuild, true);
			logger.info(`[${dbGuild.name}] Starting polling interval`);
		} else {
			logger.warn(`[${dbGuild.name}] Attempted to start second polling interval!`);
		}
	}
	public static async poll(dbGuild: DBGuild, interval = false): Promise<void> {
		if (!dbGuild.raidHelper.apiKey) {
			logger.info(`[${dbGuild.name}] No API Key! Polling stopped.`);
			return;
		}

		let retryAfterAwaited = false;
		try {
			// poll
			const events = await this.getEvents(dbGuild);
			await this.onFetchEventSuccess(dbGuild, events);
			logger.debug('Event Poll Success');
		} catch (response) {
			if (response instanceof Response) {
				switch (response.status) {
					case 429:
						const retryAfter = response.headers.get('retry-after');

						if (retryAfter) {
							const retryDate = new Date(retryAfter);
							const diff = retryDate.getTime() - Date.now();
							await RaidhelperIntegration.onFetchEventError(
								dbGuild,
								'Your Raidhelper API Key was rate-limited! Retrying in ' +
									Math.round(diff / 1000) +
									' seconds. You can refresh your API key in the Raidhelper Integration settings to fix this immediately.'
							);
							logger.error(
								`[${dbGuild.name}] Rate Limited! Retrying in ${Math.round(
									diff / 1000
								)}s (${retryDate.toDateString()})`
							);
							await promiseTimeout(diff);
							retryAfterAwaited = true;
						} else {
							logger.error(
								`[${dbGuild.name}] Rate Limited! \nHeaders: ${[
									...response.headers.entries()
								].toString()}`
							);
						}

						break;

					case 401:
						await RaidhelperIntegration.onFetchEventError(
							dbGuild,
							'Raidhelper API key is invalid.\nPlease refresh it in the Raidhelper Integration settings.'
						);
						dbGuild.raidHelper.apiKeyValid = false;
						await dbGuild.save();
						break;
					case 404:
						await RaidhelperIntegration.onFetchEventError(
							dbGuild,
							'Raidhelper API is currently unreachable.\nThe Raidhelper Integration will not work until it is back up again!'
						);
						break;
					default:
						logger.error(
							`[${dbGuild.name}] ${response.status}: ${response.statusText}\nHeaders: ${[
								...response.headers.entries()
							].toString()}`
						);
				}
			} else {
				logger.error(
					`[${dbGuild.name}] Internal: ${String(response)}`
				);
			}
		} finally {
			if (!retryAfterAwaited) {
				const timeout = 1000 * 60 * POLL_INTERVAL_MINUTES;
				await promiseTimeout(timeout);
			}
			if ((interval || retryAfterAwaited) && activePollIntervals[dbGuild.id]) {
				// Refresh dbGuild data and start next poll
				Database.getGuild(dbGuild.id)
					.then((dbGuild) => this.poll(dbGuild, interval))
					.catch(logger.error);
			} else {
				if (interval) {
					logger.info(`[${dbGuild.name}] Polling interval stopped!`);
				}
			}
		}
	}

	public static async onFetchEventSuccess(
		dbGuild: DBGuild,
		events: ScheduledEvent[]
	): Promise<void> {
		// Reset retries
		const activePollObject = activePollIntervals[dbGuild.id];
		if (activePollObject) activePollObject.retries = 0;

		// Send notification if apiKey vas previously not valid
		if (dbGuild.raidHelper.apiKey && !dbGuild.raidHelper.apiKeyValid) {
			await NotificationHandler.sendNotification(
				dbGuild,
				'Raidhelper Integration',
				'Raidhelper API key validated ✅\nThis channel will now receive updates about scheduled events again!',
				{ color: Colors.Green, byPassDuplicateCheck: true }
			);
		}

		const oldEvents = [...dbGuild.raidHelper.events];
		dbGuild.raidHelper.apiKeyValid = true;
		dbGuild.raidHelper.events = events;
		await dbGuild.save();

		try {
			const guild = await Bot.client.guilds.fetch(dbGuild.id);

			if (guild) {
				await RaidhelperIntegration.sendEventNotifications(guild, dbGuild, events, oldEvents).catch(
					logger.error
				);

				const widget = await Widget.find(dbGuild);
				if (!widget?.textState) {
					const currentlyScheduledEvent =
						dbGuild.raidHelper.events.length > 0
							? dbGuild.raidHelper.events.reduce((lowest, current) =>
									Math.abs(current.startTimeUnix * 1000 - Date.now()) <
									Math.abs(lowest.startTimeUnix * 1000 - Date.now())
										? current
										: lowest
							  )
							: undefined;
					const previouslyScheduledEvent =
						oldEvents.length > 0
							? oldEvents.reduce((lowest, current) =>
									Math.abs(current.startTimeUnix * 1000 - Date.now()) <
									Math.abs(lowest.startTimeUnix * 1000 - Date.now())
										? current
										: lowest
							  )
							: undefined;
					const isNewEvent = currentlyScheduledEvent && !previouslyScheduledEvent;
					const isNoEvent = events.length === 0;
					const isSameEvent =
						currentlyScheduledEvent &&
						previouslyScheduledEvent &&
						currentlyScheduledEvent.id === previouslyScheduledEvent.id;
					const hasChangedProperties =
						isSameEvent &&
						currentlyScheduledEvent.lastUpdatedUnix !== previouslyScheduledEvent.lastUpdatedUnix;

					if (isNewEvent || isNoEvent || !isSameEvent || (isSameEvent && hasChangedProperties)) {
						await widget?.update({ force: true });
					}
				}
			}
		} catch (e) {
			logger.error(`[${dbGuild.name}] Failed to send onFetchEventSucess notifications!`, e);
		}
	}
	private static async onFetchEventError(dbGuild: DBGuild, message: string): Promise<void> {
		try {
			const body = message + '\n\n*If this issue persist please ask for help in the support discord!*';

			// Send notification
			await NotificationHandler.sendNotification(dbGuild, 'Raidhelper Integration Error', body, {
				color: Colors.Red
			});

			// Update widget to reflect that API key is not valid
			const widget = await Widget.find(dbGuild);
			if (!widget?.textState) {
				await widget?.update({ force: true });
			}
		} catch (e) {
			logger.error(`[${dbGuild.name}] Failed to send onFetchEventError notifications!`, e);
		}
	}
	/**
	 * @param guild
	 * @param dbGuild
	 * @param events event list returned from the raidhelper api
	 * @returns
	 */
	public static async sendEventNotifications(
		guild: Guild,
		dbGuild: DBGuild,
		events: ScheduledEvent[],
		oldEvents: ScheduledEvent[]
	): Promise<void> {
		// request events
		if (!dbGuild) return Promise.reject();

		// return if there is no change in events
		if (
			oldEvents.every((oldEvent) => events.find((event) => event.id === oldEvent.id)) &&
			events.every((event) => oldEvents.find((oldEvent) => event.id === oldEvent.id))
		)
			return;

		// Check for old events that have been descheduled and notify
		const descheduledEvents = oldEvents.filter(
			(event) => !events.find((newEvent) => newEvent.id === event.id)
		);
		if (descheduledEvents.length !== 0 && guild) {
			await this.notifyDescheduledEvents(descheduledEvents, dbGuild, guild);
			logger.info(`[${dbGuild.name}] Sent descheduled events notification`);
		}

		// Check for new events and notify
		const newEvents = events.filter(
			(event) => !oldEvents.find((oldEvent) => oldEvent.id === event.id)
		);
		if (newEvents.length !== 0) {
			await this.notifyScheduledEvents(newEvents, dbGuild, guild);
			logger.info(`[${dbGuild.name}] Sent scheduled events notification`);
		}
	}
	/**
	 * Notify guild in notification channel about newly scheduled events
	 * @param events
	 * @param dbGuild
	 * @param guild
	 */
	private static async notifyScheduledEvents(
		events: ScheduledEvent[],
		dbGuild: DBGuild,
		guild: Guild
	): Promise<void> {
		const scheduledEvents = await formatEvents(guild, ...events);

		await NotificationHandler.sendNotification(
			dbGuild,
			`**New Event${scheduledEvents.length > 1 ? 's' : ''} Scheduled**`,
			`${scheduledEvents.map((e) => `- ${e}`).join('\n')}`,
			{ color: Colors.Green, byPassDuplicateCheck: true }
		).catch(logger.error);
	}
	/**
	 * Notify guild in notification channel about descheduled events
	 * @param events
	 * @param dbGuild
	 * @param guild
	 */
	private static async notifyDescheduledEvents(
		events: ScheduledEvent[],
		dbGuild: DBGuild,
		guild: Guild
	): Promise<void> {
		const scheduledEvents = await formatEvents(guild, ...events);
		await NotificationHandler.sendNotification(
			dbGuild,
			`**Event${scheduledEvents.length > 1 ? 's' : ''} Descheduled**`,
			`${scheduledEvents.map((e) => `- ${e}`).join('\n')}`,
			{ color: Colors.DarkOrange, byPassDuplicateCheck: true }
		).catch(logger.error);
	}

	public static async interval(): Promise<void> {
		const date = new Date();
		const seconds = date.getSeconds();
		const minutes = date.getMinutes();

		// Only run on war start
		if (!((minutes === 59 || minutes === 29) && seconds === 40)) return;

		try {
			const dbGuilds = await Database.queryGuilds({
				'raidHelper.events': { $exists: true, $ne: [] },
				'raidHelper.apiKey': { $exists: true },
				'raidHelper.apiKeyValid': true,
				$or: [{ 'raidHelper.enabled': true }, { 'raidHelper.widget': true }]
			});

			const findEarliestEventWithinThreshold = (
				events: ScheduledEvent[]
			): ScheduledEvent | undefined => {
				let earliestEvent: ScheduledEvent | undefined;
				let earliestStartTime: number = Infinity;

				for (const event of events) {
					const warStartTime = roundUpHalfHourUnix(event.startTimeUnix);
					const diff = warStartTime * 1000 - Date.now();
					const diffSeconds = diff / 1000;
					const isWithinThreshold = diffSeconds <= 60; // 60 seconds buffer

					if (isWithinThreshold && diffSeconds < earliestStartTime) {
						earliestStartTime = diffSeconds;
						earliestEvent = event;
					}
				}
				return earliestEvent;
			};

			// for each guild find the closest event and attempt to start the widget and voice
			for (const dbGuild of dbGuilds) {
				const event = findEarliestEventWithinThreshold(dbGuild.raidHelper.events);
				if (!event) break;

				const widget = await Widget.find(dbGuild);

				// Voice Start
				try {
					// Connect to voice if auto-join is enabled
					if (dbGuild.raidHelper.enabled) {
						let channel: GuildBasedChannel | null = await getEventVoiceChannel(event, dbGuild.id);

						if (!channel)
							throw new Error(
								'No voice channel specified in event and no default voice channel set'
							);
						if (!channel.isVoiceBased()) throw new Error(`${channel} is not a voice channel.`);

						await audioManager.subscribe(dbGuild.id, channel);
						logger.info(`[${dbGuild.name}][Raidhelper] Voice autojoin`);
					}
				} catch (e) {
					await NotificationHandler.sendNotification(
						dbGuild,
						`Voice Error`,
						`Error while attempting to join channel\nfor scheduled event **${event.title}**\n\n${
							(e instanceof Error ? e.message : e?.toString?.()) || 'Unknown Error'
						}`
					).catch(logger.error);
				}

				// Widget Start
				// Attempt to start widget if auto-widget is enabled
				if (dbGuild.raidHelper.widget) {
					if (widget) {
						await textManager.subscribe(dbGuild.id);
						logger.info(`[${dbGuild.name}][Raidhelper] Widget autostart`);
					} else {
						await NotificationHandler.sendNotification(
							dbGuild,
							`Raidhelper Integration`,
							`Tried to enable text-widget for scheduled event\n**${event.title}**\n\n**Auto-Widget is enabled but I can't find a widget to enable.**`,
							{ color: Colors.DarkOrange }
						).catch(logger.error);
					}
				}
			}
		} catch (e) {
			logger.error('Error in raidhelper integration interval. ', e);
		}
	}

	/**
	 * Retrieves new events and returns them
	 * @param guild
	 * @returns
	 * @throws {Response}
	 */
	public static async getEvents(dbGuild: DBGuild): Promise<ScheduledEvent[]> {
		if (!dbGuild.raidHelper.apiKey) {
			return Promise.reject('Raidhelper API Key not set.');
		}
		const serversEventsUrl = `https://raid-helper.dev/api/v3/servers/${dbGuild.id}/events`;
		const startTimeFilter: number = Math.round(Date.now() / 1000 - 60 * GRACE_PERIOD_MINUTES);

		const header = new Headers();
		header.set('Authorization', dbGuild.raidHelper.apiKey);
		header.set('IncludeSignups', 'false');
		header.set('StartTimeFilter', startTimeFilter.toString());
		if (dbGuild.raidHelper.eventChannelId) {
			header.set('ChannelFilter', dbGuild.raidHelper.eventChannelId);
		}

		logger.debug(`[${dbGuild.name}] Fetching events`, [...header.entries()]);

		const postedEvents: Omit<RaidhelperAPIEvent, 'advancedSettings'>[] = await fetch(
			serversEventsUrl,
			{
				headers: header
			}
		)
			.then((res) => {
				if (res.ok) return res;
				else throw res;
			})
			.then((res) => res.json())
			.then(({ postedEvents }) => postedEvents);

		logger.debug(
			`[${dbGuild.name}] Fetched events`,
			postedEvents?.map((e) => e.id)
		);
		return (
			await Promise.allSettled(
				postedEvents?.map(async ({ id, lastUpdated }) => {
					// Check is event is already scheduled
					const scheduledEvent = dbGuild.raidHelper.events.find(
						(scheduledEvent) => scheduledEvent.id === id
					);

					// If event is unchanged since it has been scheduled then return it
					if (scheduledEvent?.lastUpdatedUnix === lastUpdated) {
						logger.debug(`[${dbGuild.name}] Skipping event ${id}. Already scheduled.`);
						return Promise.resolve(scheduledEvent);
					}
					logger.debug(`[${dbGuild.name}] Fetching event ${id}`);
					// If event is updated or new fetch it
					const event: RaidhelperAPIEvent = await fetch(
						`https://raid-helper.dev/api/v2/events/${id}`,
						{
							headers: header
						}
					)
						.then((res) => res.json())
						.then((event) => event);

					logger.debug(`[${dbGuild.name}] Fetched event ${id}`);

					return {
						// Need to map to new object so the entire event object doesn't get saved to databse
						id: event.id,
						startTimeUnix: event.startTime,
						title: event.title,
						voiceChannelId: event.advancedSettings.voice_channel?.match(/^[0-9]+$/)
							? event.advancedSettings.voice_channel
							: undefined,
						lastUpdatedUnix: event.lastUpdated
					} as ScheduledEvent;
				}) ?? []
			)
		)
			.map((result) => {
				if (result.status === 'fulfilled') {
					return result.value;
				}
			})
			.filter((event): event is ScheduledEvent => !!event);
	}
}
export default new RaidhelperIntegration();
