import { setTimeout as promiseTimeout } from 'timers/promises';
import { RaidhelperAPIEvent, ScheduledEvent } from './common/types/raidhelperEvent';
import { Client, Colors, Guild, Message, MessageType, PartialMessage } from 'discord.js';
import logger from '../lib/logger';
import { Widget } from './widget';
import audioManager from './handlers/audioManager';
import { NotificationHandler } from './handlers/notificationHandler';
import { DBGuild } from './common/types/dbGuild';
import { checkChannelPermissions } from './util/permissions';
import Database from './db/database';
import { formatEvents } from './util/formatEvents';
import { RAIDHELPER_API_RATE_LIMIT_DAY, RAIDHELPER_INTEGRATION_NUM_EVENTS_PER_QUERY, RAIDHELPER_INTEGRATION_QUERY_INTERVAL_MS } from './common/constant';
import { getEventPollingInterval } from './util/getEventPollingInterval';

const MAX_POLL_RETRIES = 20;
const RETRY_ATTEMPT_DUR = 3;
const RETRY_INTERVAL_SECONDS = 5;
const GRACE_PERIOD_MINUTES = 20; // Amount of time that events are checked in the past (e.g. if raidhelper is set to pre-war meeting time)
// let pollingInterval: NodeJS.Timeout | undefined;
const pollingIntervals: {
    [guildId: string]: NodeJS.Timeout
} = {};
const pollingRetries: {
    [guildId: string]: number
} = {};
export class RaidhelperIntegration {
    // TODO add retry mechanisim that remove the api key after e.g. 10 retries
    // Polls the raidhelper api every RAIDHELPER_INTEGRATION_QUERY_INTERVAL_MS milliseconds to retrieve new events
    public static async startPollingInterval(guild: Guild, dbGuild: DBGuild): Promise<void> {
        try {
            if (dbGuild.id in pollingIntervals) {
                clearTimeout(pollingIntervals[dbGuild.id]);
            }
            let events;
            events = await this.getEvents(dbGuild);
            await this.onFetchEventSuccess(guild, dbGuild, events);
        } catch (e) {
            // Set retries
            pollingRetries[dbGuild.id] = (pollingRetries[dbGuild.id] ?? 0) + 1;
            logger.error(`[${dbGuild.name}] Polling failed (Attempt #${pollingRetries[dbGuild.id]})`);

            dbGuild.raidHelper.apiKeyValid = false;
            await dbGuild.save();

            if (guild) {
                await RaidhelperIntegration.onFetchEventError(
                    guild,
                    dbGuild
                );
            }
        } finally {
            const timeout = getEventPollingInterval(dbGuild.raidHelper.events.length);

            // If too many retries, reset api key and stop polling else schedule a new poll
            const tooManyTries = dbGuild.id in pollingRetries && pollingRetries[dbGuild.id] >= MAX_POLL_RETRIES;
            if (tooManyTries) {
                dbGuild.raidHelper.apiKey = undefined;
                await dbGuild.save();
                logger.error(`[${dbGuild.name}] Polling failed >20 times, removing API key`);

            } else if (guild) {
                // Set Timeout for new poll
                await new Promise((res) => {
                    pollingIntervals[dbGuild.id] = setTimeout(res, timeout)
                });
                // Refresh dbGuild data and start next poll
                Database.getGuild(guild).then((dbGuild) =>
                    this.startPollingInterval(guild, dbGuild)
                ).catch(logger.error);
            }

        }
    }

    public static async onFetchEventSuccess(guild: Guild | undefined, dbGuild: DBGuild, events: ScheduledEvent[]): Promise<void> {
        // Reset retries
        pollingRetries[dbGuild.id] = 0;
        const oldEvents = [...dbGuild.raidHelper.events];
        dbGuild.raidHelper.apiKeyValid = true;
        dbGuild.raidHelper.events = events;
        await dbGuild.save();

        try {
            // Send notification if apiKey vas previously not valid
            if (guild && dbGuild.raidHelper.apiKey && !dbGuild.raidHelper.apiKeyValid) {
                await NotificationHandler.sendNotification(
                    guild,
                    dbGuild,
                    'Raidhelper Integration',
                    'Raidhelper API key validated ✅\nThis channel will now receive updates about scheduled events!',
                    { color: Colors.Green, byPassDuplicateCheck: true }
                )
            }


            if (guild) {
                await RaidhelperIntegration.sendEventNotifications(guild, dbGuild, events, oldEvents)
                    .catch(logger.error);

                const widget = await Widget.find(
                    guild,
                    dbGuild.widget.messageId,
                    dbGuild.widget.channelId
                )
                if (!widget?.getTextState()) {
                    await widget?.update({ force: true });
                }
            }
        } catch (e) {
            logger.error(`[${dbGuild.name}] Failed to send onFetchEventSucess notifications!`);
        }
    }
    private static async onFetchEventError(guild: Guild | null, dbGuild: DBGuild): Promise<void> {
        try {
            if (guild) {
                const message = pollingRetries[dbGuild.id] < MAX_POLL_RETRIES ?
                    'Error while trying to schedule a Raidhelper event.\n' +
                    'Check your Raidhelper Integration settings in `/settings`\n' +
                    'If this issue persists try resetting your data in `Misc Settings`'
                    : `Failed to fetch events ${MAX_POLL_RETRIES} times in a row.\n` +
                    'Your Raidhelper API key has been reset. Check your Raidhelper Integration settings.';

                // Send notification
                await NotificationHandler.sendNotification(
                    guild,
                    dbGuild,
                    'Raidhelper Integration Error',
                    message,
                    { color: Colors.Red }
                );

                // Update widget to reflect that API key is not valid
                const widget = await Widget.find(
                    guild,
                    dbGuild.widget.messageId,
                    dbGuild.widget.channelId
                )
                if (!widget?.getTextState()) {
                    await widget?.update({ force: true });
                }
            }
        } catch (e) {
            logger.error('Error while handling updateEventStatus error: ' + (e instanceof Error ? e.message : e?.toString?.()) || 'Unknown');
        }
    }
    /**
     * @param guild 
     * @param dbGuild 
     * @param events event list returned from the raidhelper api
     * @returns 
     */
    public static async sendEventNotifications(guild: Guild, dbGuild: DBGuild, events: ScheduledEvent[], oldEvents: ScheduledEvent[]): Promise<void> {
        // request events 
        if (!dbGuild) return Promise.reject();

        // return if there is no change in events
        if (oldEvents.every((oldEvent) => events.find((event) => event.id === oldEvent.id)) &&
            events.every((event) => oldEvents.find((oldEvent) => event.id === oldEvent.id))) return;

        // Check for old events that have been descheduled and notify
        const descheduledEvents = oldEvents.filter((event) => !events.find((newEvent) => newEvent.id === event.id));
        if (descheduledEvents.length !== 0 && guild) {
            await this.notifyDescheduledEvents(descheduledEvents, dbGuild, guild);
            logger.info(`[${dbGuild.name}] Sent descheduled events notification`)
        }

        // Check for new events and notify
        const newEvents = events.filter((event) => !oldEvents.find((oldEvent) => oldEvent.id === event.id));
        if (newEvents.length !== 0) {
            await this.notifyScheduledEvents(newEvents, dbGuild, guild);
            logger.info(`[${dbGuild.name}] Sent scheduled events notification`)
        }
    }
    /**
     * Notify guild in notification channel about newly scheduled events
     * @param events 
     * @param dbGuild 
     * @param guild 
     */
    private static async notifyScheduledEvents(events: ScheduledEvent[], dbGuild: DBGuild, guild: Guild): Promise<void> {
        const scheduledEvents = await formatEvents(guild, ...events);
        const info = `${scheduledEvents.some((ev) => ev.includes('⚠️')) ? ' ≫ *Missing Some Permissions*' : ''}`;
        await NotificationHandler.sendNotification(
            guild, dbGuild,
            `** New Event${scheduledEvents.length > 1 ? 's' : ''} Scheduled**`,
            `${info}\n${scheduledEvents.map((e) => `- ${e}`).join('\n')}`,
            { color: Colors.Green, byPassDuplicateCheck: true }
        ).catch(logger.error);
    }
    /**
     * Notify guild in notification channel about descheduled events
     * @param events 
     * @param dbGuild 
     * @param guild 
     */
    private static async notifyDescheduledEvents(events: ScheduledEvent[], dbGuild: DBGuild, guild: Guild): Promise<void> {
        const scheduledEvents = await formatEvents(guild, ...events);
        await NotificationHandler.sendNotification(
            guild, dbGuild,
            `**Event${scheduledEvents.length > 1 ? 's' : ''} Descheduled**`,
            `${scheduledEvents.map((e) => `- ${e}`).join('\n')}`,
            { color: Colors.DarkOrange, byPassDuplicateCheck: true }
        ).catch(logger.error);
    }
    public static async interval(client: Client): Promise<void> {
        const date = new Date();
        const [minutes, seconds] = [date.getMinutes(), date.getSeconds(), date.getHours()];

        // TODO add logic for 10 minutes before each war that checks if any upcoming events have problematic channel permissions and sends a notification if that's the case
        // Only run within the first RETRY_ATTEMPT_DUR after war begin and every RETRY_INTERVAL_SECONDS seconds
        if (minutes >= 0 && minutes < RETRY_ATTEMPT_DUR ||
            minutes >= 30 && minutes < 30 + RETRY_ATTEMPT_DUR &&
            seconds % RETRY_INTERVAL_SECONDS === 0) {

            try {
                const dbGuilds = await Database.getAllGuilds();
                // Get guilds with an API Key from DB and filter out those with events starting soon
                let guilds = dbGuilds
                    .map((dbGuild) => ({
                        db: dbGuild,
                        client: client.guilds.cache.find((clientGuild) => clientGuild.id === dbGuild.id)
                    }));

                // Get guilds with an API Key from DB and filter out those with events starting soon
                guilds = guilds.filter((guild) =>
                    guild.db.raidHelper.events.find((event) => {
                        // Past events = negative diff, Future events = positive diff
                        const diff = event.startTimeUnix * 1000 - Date.now();
                        const diffSeconds = diff / 1000;
                        const diffMinutes = diffSeconds / 60;

                        const isWithinFutureThreshold = diffSeconds < 5;
                        const isWithinPastThreshold = diffMinutes > GRACE_PERIOD_MINUTES * -1;

                        return isWithinFutureThreshold && isWithinPastThreshold;
                    }));

                // for each guild find the closest event and attempt to start the widget and voice
                for (const guild of guilds) {
                    if (!guild.client) return;
                    if (!guild.db.raidHelper.enabled && !guild.db.raidHelper.widget) return;
                    const event = guild.db.raidHelper.events.reduce((lowest, current) =>
                        Math.abs(current.startTimeUnix * 1000 - Date.now()) < Math.abs(lowest.startTimeUnix * 1000 - Date.now()) ? current : lowest);

                    // Try to find a widget
                    const widget = await Widget.find(
                        guild.client,
                        guild.db.widget.messageId,
                        guild.db.widget.channelId
                    );


                    // Voice Start
                    try {
                        // Connect to voice if not connected and auto-join is enabled
                        if (guild.db.raidHelper.enabled && !audioManager.isConnected(guild.client.id)) {
                            let channel;
                            if (event.voiceChannelId) {
                                channel = await guild.client.channels.fetch(event.voiceChannelId);
                            } else if (guild.db.raidHelper.defaultVoiceChannelId) {
                                channel = await guild.client.channels.fetch(guild.db.raidHelper.defaultVoiceChannelId);
                            }


                            if (!channel) throw new Error('No voice channel specified in event and no default voice channel set');
                            if (!channel.isVoiceBased()) throw new Error(`${channel} is not a voice channel.`);

                            await (widget ?
                                widget.toggleVoice({
                                    dbGuild: guild.db,
                                    channel
                                }) : audioManager.connect(channel, guild.db));
                            logger.debug('Joined voice via raidhelper integration');
                        }
                    } catch (e) {
                        await NotificationHandler.sendNotification(
                            guild.client,
                            guild.db,
                            `Voice Error`,
                            `Error while attempting to join channel\nfor scheduled event **${event.title}**\n\n${(e instanceof Error ? e.message : e?.toString?.()) || 'Unknown Error'}`
                        ).catch(logger.error);
                    }

                    // Widget Start
                    try {
                        // Attempt to start widget if auto-widget is enabled
                        if (guild.db.raidHelper.widget) {
                            if (widget) {
                                if (widget.getTextState() || widget.getResettingState()) return; // It's already on or currently resetting
                                await widget.toggleText(true);
                                logger.debug('Started widget via raidhelper integration');
                            } else {
                                await NotificationHandler.sendNotification(
                                    guild.client,
                                    guild.db,
                                    `Raidhelper Integration`,
                                    `Tried to enable text-widget for scheduled event\n**${event.title}**\n\n**Auto-Widget is enabled but I can't find a widget to enable.**`,
                                    { color: Colors.DarkOrange }
                                ).catch(logger.error);
                            }
                        }
                    } catch (e) {
                        await NotificationHandler.sendNotification(
                            guild.client,
                            guild.db,
                            `Widget Error`,
                            `Error while attempting to enable text-widget\nfor scheduled event **${event.title}**\n\n${(e instanceof Error ? e.message : e?.toString?.()) || 'Unknown Error'}`
                        ).catch(logger.error);
                    }
                }
            } catch (e) {
                logger.error('Error in raidhelper integration interval. ' + (e instanceof Error ? e.message : e?.toString?.()) || 'Unknown Error');
            }
        }
    }

    /**
     * Retrieves new events, saves them to the guild object in db
     * and returns the events
     * @param guild 
     * @returns 
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

        return fetch(serversEventsUrl, {
            headers: header
        })
            .then((res) => res.ok ? res : Promise.reject(res))
            .then((res) => res.json())
            .then(async (data: {
                postedEvents?: Omit<RaidhelperAPIEvent, 'advancedSettings'>[];
            }) => {
                // Get only the next RAIDHELPER_INTEGRATION_NUM_EVENTS_PER_QUERY events
                const closestEvents = data.postedEvents?.reduce<Omit<RaidhelperAPIEvent, 'advancedSettings'>[]>((acc, obj) => {
                    if (acc.length < RAIDHELPER_INTEGRATION_NUM_EVENTS_PER_QUERY || obj.startTime < acc[3].startTime) {
                        // Add the current object to the result array while maintaining sorted order
                        const indexToInsert = acc.findIndex(item => obj.startTime < item.startTime);
                        if (indexToInsert === -1) {
                            acc.push(obj);
                        } else {
                            acc.splice(indexToInsert, 0, obj);
                        }
                        if (acc.length > RAIDHELPER_INTEGRATION_NUM_EVENTS_PER_QUERY) {
                            acc.pop();
                        }
                    }

                    return acc;
                }, []);
                return Promise.all(closestEvents?.map((fetchedEvent) => {
                    return new Promise<ScheduledEvent | undefined>(async (res) => {
                        while (true) {
                            try {
                                // If there was already a saved event reuse that instead of fetching it again (This doesn't update the voicechannel but that's the cost for not hitting the rate-limit)
                                const event = await fetch(`https://raid-helper.dev/api/v2/events/${fetchedEvent.id}`, { headers: header })
                                    .then((res) => res.ok ? res : Promise.reject(res))
                                    .then((res) => res.json())
                                    .then((event: RaidhelperAPIEvent) => ({ // Need to map to new object so the entire event object doesn't get saved to databse
                                        id: event.id,
                                        startTimeUnix: event.startTime,
                                        title: event.title,
                                        voiceChannelId: event.advancedSettings.voice_channel.match(/^[0-9]+$/) ? event.advancedSettings.voice_channel : undefined,
                                    } as ScheduledEvent));

                                if (event) {
                                    return res(event);
                                }
                            } catch (e) {
                                if (e instanceof Object && e.hasOwnProperty('code') && (e as { code: number }).code === 429) {
                                    logger.error(e.toString() || 'Unknown');
                                    await promiseTimeout(1000);
                                }
                                else return res(undefined);
                            }
                        }
                    });
                }) ?? []).then((events) => events.filter((event) => !!event) as ScheduledEvent[])
            });
    }
}
export default new RaidhelperIntegration();