import { setTimeout as promiseTimeout } from 'timers/promises';
import { RaidhelperAPIEvent, ScheduledEvent } from '../common/types/raidhelperEvent';
import { Colors, Guild, GuildBasedChannel, Message, PartialMessage } from 'discord.js';
import logger from '../../lib/logger';
import { Widget } from '../widget';
import audioManager from '../handlers/audioManager';
import { NotificationHandler } from '../handlers/notificationHandler';
import { DBGuild } from '../common/types/dbGuild';
import Database from '../db/database';
import { formatEvents } from '../util/formatEvents';
import {
	GRACE_PERIOD_MINUTES,
	POLL_INTERVAL_MINUTES,
	PRE_JOIN_BUFFER,
	RAIDHELPER_USER_ID,
	WAR_START_INTERVAL
} from '../common/constant';
import Bot from '../bot';
import textManager from '../handlers/textManager';
import { getEventVoiceChannel } from '../util/discord';

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
		// Handle message creation event
		Bot.client.on('messageCreate', this.handleMessageCreate.bind(this));

		// Handle message deletion event
		Bot.client.on('messageDelete', this.handleMessageDelete.bind(this));
	}

	// Method to handle message creation
	private static async handleMessageCreate(message: Message): Promise<void> {
		const guild = message.guild;

		if (message.author.id !== RAIDHELPER_USER_ID || message.type !== 20 || !guild) {
			return;
		}
		try {
			const dbGuild = await Database.getGuild(guild.id);

			// Skip polling if channel is not observed
			if (
				dbGuild.raidHelper.eventChannelId?.length &&
				!dbGuild.raidHelper.eventChannelId.includes(message.channelId)
			) {
				return;
			}

			if (dbGuild.raidHelper.apiKey) {
				await promiseTimeout(1000);
				await this.poll(dbGuild);
			}
		} catch (err) {
			logger.error(`[${guild.name}] Autopoll on messageCreate failed`);
		}
	}

	// Method to handle message deletion
	private static async handleMessageDelete(message: Message | PartialMessage): Promise<void> {
		const guild = message.guild;

		if (message.author?.id !== RAIDHELPER_USER_ID || message.type !== 0 || !guild) {
			return;
		}
		try {
			const dbGuild = await Database.getGuild(guild.id);

			// Skip polling if channel is not observed
			if (
				dbGuild.raidHelper.eventChannelId?.length &&
				!dbGuild.raidHelper.eventChannelId.includes(message.channelId)
			) {
				return;
			}

			if (dbGuild.raidHelper.apiKey) {
				await promiseTimeout(10000);
				await this.poll(dbGuild);
			}
		} catch (err) {
			logger.error(`[${guild.name}] Autopoll on messageDelete failed`);
		}
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

	private static async handleRateLimit(response: Response, dbGuild: DBGuild): Promise<void> {
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
		} else {
			logger.error(
				`[${dbGuild.name}] Rate Limited! \nHeaders: ${[...response.headers.entries()].toString()}`
			);
		}
	}

	private static async handleInvalidApiKey(dbGuild: DBGuild): Promise<void> {
		await RaidhelperIntegration.onFetchEventError(
			dbGuild,
			'Raidhelper API key is invalid.\nPlease refresh it in the Raidhelper Integration settings.'
		);
		dbGuild.raidHelper.apiKeyValid = false;
		await dbGuild.save();
	}

	private static async handleApiUnreachable(dbGuild: DBGuild): Promise<void> {
		await RaidhelperIntegration.onFetchEventError(
			dbGuild,
			'Raidhelper API is currently unreachable.\nThe Raidhelper Integration will not work until it is back up again!'
		);
	}

	private static handleBadGateway(response: Response, dbGuild: DBGuild): void {
		logger.debug(
			`[${dbGuild.name}] ${response.status}: ${response.statusText}\nHeaders: ${[
				...response.headers.entries()
			].toString()}`
		);
	}

	public static async poll(dbGuild: DBGuild, interval = false): Promise<void> {
		if (!dbGuild.raidHelper.apiKey) {
			logger.info(`[${dbGuild.name}] No API Key! Polling stopped.`);
			return;
		}

		let retryAfterAwaited = false;
		try {
			// Poll for events
			const events = await this.getEvents(dbGuild);
			await this.onFetchEventSuccess(dbGuild, events);
			logger.debug('Event Poll Success');
		} catch (response) {
			await this.handlePollError(response, dbGuild);
		} finally {
			await this.scheduleNextPoll(dbGuild, interval, retryAfterAwaited);
		}
	}

	private static async handlePollError(response: unknown, dbGuild: DBGuild): Promise<void> {
		if (response instanceof Response) {
			switch (response.status) {
				case 429:
					await this.handleRateLimit(response, dbGuild);
					break;
				case 401:
					await this.handleInvalidApiKey(dbGuild);
					break;
				case 404:
					await this.handleApiUnreachable(dbGuild);
					break;
				case 502:
					this.handleBadGateway(response, dbGuild);
					break;
				default:
					logger.error(
						`[${dbGuild.name}] ${response.status}: ${response.statusText}\nHeaders: ${[
							...response.headers.entries()
						].toString()}`
					);
			}
		} else {
			logger.error(`[${dbGuild.name}] Internal: ${String(response)}`);
		}
	}

	private static async scheduleNextPoll(
		dbGuild: DBGuild,
		interval: boolean,
		retryAfterAwaited: boolean
	): Promise<void> {
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

	public static async onFetchEventSuccess(
		dbGuild: DBGuild,
		events: ScheduledEvent[]
	): Promise<void> {
		// Reset retries
		const activePollObject = activePollIntervals[dbGuild.id];
		if (activePollObject) activePollObject.retries = 0;

		if (dbGuild.raidHelper.apiKey && !dbGuild.raidHelper.apiKeyValid) {
			// Send notification if apiKey was previously not valid
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

		const guild = await Bot.client.guilds.fetch(dbGuild.id).catch(() => undefined);
		if (!guild) return;

		await this.sendEventNotifications(guild, dbGuild, events, oldEvents).catch(logger.error);

		const widget = await Widget.find(dbGuild);
		if (widget?.textState) return;

		const currentlyScheduledEvent = this.getClosestEvent(dbGuild.raidHelper.events);
		const previouslyScheduledEvent = this.getClosestEvent(oldEvents);

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
	private static getClosestEvent(events: ScheduledEvent[]): ScheduledEvent | undefined {
		return events.reduce((closest, event) => {
			const eventTimeDiff = Math.abs(event.startTimeUnix * 1000 - Date.now());
			const closestTimeDiff = Math.abs(closest.startTimeUnix * 1000 - Date.now());
			return eventTimeDiff < closestTimeDiff ? event : closest;
		}, events[0]);
	}
	private static async onFetchEventError(dbGuild: DBGuild, message: string): Promise<void> {
		try {
			const body =
				message + '\n\n*If this issue persist please ask for help in the support discord!*';

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

	private static checkWarStart(): boolean {
		const date = new Date();
		const seconds = date.getSeconds();
		const minutes = date.getMinutes();

		return (minutes + 1) % WAR_START_INTERVAL === 0 && seconds === PRE_JOIN_BUFFER;
	}

	private static async getGuildsWithUpcomingEvents(): Promise<DBGuild[]> {
		const dbGuilds = await Database.queryGuilds([
			// Unwind the events array
			{ $unwind: '$raidHelper.events' },
			// Match events within the specified time frame
			{
				$match: {
					'raidHelper.events.startTimeUnix': {
						$gte: Math.floor(Date.now() / 1000) - 60 * GRACE_PERIOD_MINUTES,
						$lte: Math.floor(Date.now() / 1000) + 60 * GRACE_PERIOD_MINUTES
					},
					$or: [{ 'raidHelper.enabled': true }, { 'raidHelper.widget': true }]
				}
			},
			// Add a field to calculate the difference between the event start time and the current time
			{
				$addFields: {
					timeDiffMs: {
						$abs: {
							$subtract: [{ $multiply: ['$raidHelper.events.startTimeUnix', 1000] }, Date.now()]
						}
					}
				}
			},
			// Sort by the time difference
			{ $sort: { timeDiffMs: 1 } },
			// Group by guild and pick the closest event
			{
				$group: {
					_id: '$_id',
					guild: { $first: '$$ROOT' },
					closestEvent: { $first: '$raidHelper.events' }
				}
			},
			// Reconstruct the guild document with only the closest event in raidHelper.events
			{
				$addFields: {
					'guild.raidHelper.events': ['$closestEvent'] // Set only the events field with the closest event
				}
			},
			// Project to include only the modified guild document
			{
				$replaceRoot: {
					newRoot: {
						$mergeObjects: [
							'$guild',
							{ id: '$_id' } // Add the virtual 'id' field manually
						]
					}
				}
			}
		]);

		return dbGuilds;
	}
	private static async autoJoinVoice(dbGuild: DBGuild, event: ScheduledEvent): Promise<void> {
		if (!dbGuild.raidHelper.enabled) return;

		// Voice Start
		logger.info(`[${dbGuild.name}][Raidhelper] Trying to auto-join voice`);
		let channel: GuildBasedChannel | null = await getEventVoiceChannel(event, dbGuild).catch(
			() => null
		);

		if (!channel || !channel.isVoiceBased()) {
			throw new Error(
				!channel
					? 'No voice channel specified in event and no default voice channel set'
					: `${channel} is not a voice channel.`
			);
		}

		await audioManager.subscribe(dbGuild.id, channel);
		logger.info(`[${dbGuild.name}][Raidhelper] Voice autojoin`);
	}
	private static async autoStartWidget(dbGuild: DBGuild, event: ScheduledEvent): Promise<void> {
		// Widget Start
		const widget = await Widget.find(dbGuild);

		if (!dbGuild.raidHelper.widget) return;
		if (!widget) {
			// If widget is not found, notify that it is missing
			throw new Error(
				`Tried to enable text-widget for scheduled event\n**${event.title}**\n\n**Auto-Widget is enabled but I can't find a widget to enable.**`
			);
		}
		await textManager.subscribe(dbGuild.id);
		logger.info(`[${dbGuild.name}][Raidhelper] Widget autostart`);
	}
	public static async interval(): Promise<void> {
		// Only run on war start
		if (!this.checkWarStart()) return;

		const dbGuilds = await this.getGuildsWithUpcomingEvents();

		logger.info(`Found ${dbGuilds.length} guilds with upcoming events`);

		dbGuilds.forEach(async (dbGuild) => {
			const event = dbGuild.raidHelper.events[0];
			if (!event) return;

			try {
				await this.autoJoinVoice(dbGuild, event);
				await this.autoStartWidget(dbGuild, event);
			} catch (e) {
				const errorMessage = e instanceof Error ? e.message : String(e);
				NotificationHandler.sendNotification(
					dbGuild,
					'Raidhelper Integration',
					`Error while attempting to auto-start\nfor scheduled event **${event.title}**\n\n${errorMessage}`,
					{
						color: Colors.DarkOrange
					}
				).catch(logger.error);
			}
		});
	}

	/**
	 * Fetches scheduled events from the Raidhelper API for a given guild.
	 *
	 * @param dbGuild - The guild object containing the Raidhelper API key and other relevant information.
	 * @returns A promise that resolves to an array of `ScheduledEvent` objects.
	 * @throws Will throw an error if the Raidhelper API key is not set.
	 *
	 * The function performs the following steps:
	 * 1. Constructs the URL to fetch events for the specified guild.
	 * 2. Sets up the necessary headers, including authorization and time filters.
	 * 3. Fetches the events from the Raidhelper API.
	 * 4. Filters out events not posted in the observed channels if multiple channels are specified.
	 * 5. Fetches detailed information for each event if it is not already scheduled and up-to-date.
	 * 6. Returns an array of scheduled events.
	 */
	public static async getEvents(dbGuild: DBGuild): Promise<ScheduledEvent[]> {
		if (!dbGuild.raidHelper.apiKey) {
			throw new Error('Raidhelper API Key not set.');
		}

		const serversEventsUrl = `https://raid-helper.dev/api/v3/servers/${dbGuild.id}/events`;
		const startTimeFilter = Math.floor(Date.now() / 1000 - 60 * GRACE_PERIOD_MINUTES);

		const headers = new Headers({
			Authorization: dbGuild.raidHelper.apiKey,
			IncludeSignups: 'false',
			StartTimeFilter: startTimeFilter.toString()
		});

		if (dbGuild.raidHelper.eventChannelId?.length === 1) {
			headers.set('ChannelFilter', dbGuild.raidHelper.eventChannelId[0]);
		}

		logger.debug(`[${dbGuild.name}] Fetching events`, [...headers.entries()]);

		const response = await fetch(serversEventsUrl, { headers });

		if (!response.ok) {
			throw response;
		}

		let { postedEvents }: { postedEvents?: Omit<RaidhelperAPIEvent, 'advancedSettings'>[] } =
			await response.json();

		// Remove events not posted in observed channels
		if (
			dbGuild.raidHelper.eventChannelId?.length &&
			dbGuild.raidHelper.eventChannelId.length >= 2
		) {
			postedEvents = postedEvents?.filter(({ channelId }) =>
				dbGuild.raidHelper.eventChannelId!.includes(channelId)
			);
		}

		if (postedEvents?.length) {
			logger.debug(
				`[${dbGuild.name}] Fetched events`,
				postedEvents.map((e) => e.id)
			);
		}

		/**
		 * Fetches the details of a scheduled event from the Raidhelper API.
		 *
		 * @param id - The unique identifier of the event.
		 * @param lastUpdated - The timestamp of the last update for the event.
		 * @returns A promise that resolves to a `ScheduledEvent` object if the event is fetched or found in the database,
		 *          or `undefined` if the event is already scheduled and up-to-date.
		 */
		const fetchEventDetails = async (
			id: string,
			lastUpdated: number
		): Promise<ScheduledEvent | undefined> => {
			const scheduledEvent = dbGuild.raidHelper.events.find((event) => event.id === id);

			if (scheduledEvent?.lastUpdatedUnix === lastUpdated) {
				logger.debug(`[${dbGuild.name}] Skipping event ${id}. Already scheduled.`);
				return scheduledEvent;
			}

			logger.debug(`[${dbGuild.name}] Fetching event ${id}`);
			const event: RaidhelperAPIEvent = await fetch(`https://raid-helper.dev/api/v2/events/${id}`, {
				headers
			}).then((res) => res.json());

			logger.debug(`[${dbGuild.name}] Fetched event ${id}`);

			return {
				id: event.id,
				startTimeUnix: event.startTime,
				title: event.title,
				voiceChannelId: event.advancedSettings.voice_channel?.match(/^[0-9]+$/)
					? event.advancedSettings.voice_channel
					: undefined,
				lastUpdatedUnix: event.lastUpdated
			} as ScheduledEvent;
		};

		const results = await Promise.allSettled(
			postedEvents?.map(({ id, lastUpdated }) => fetchEventDetails(id, lastUpdated)) ?? []
		);

		return results
			.map((result) => (result.status === 'fulfilled' ? result.value : undefined))
			.filter((event): event is ScheduledEvent => !!event);
	}
}
export default new RaidhelperIntegration();
