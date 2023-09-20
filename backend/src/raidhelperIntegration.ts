import { setTimeout } from 'timers/promises';
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

const RETRY_ATTEMPT_DUR = 3;
const RETRY_INTERVAL_SECONDS = 5;
const RAIDHELPER_USER_ID = "579155972115660803";
const GRACE_PERIOD_MINUTES = 20; // Amount of time that events are checked in the past (e.g. if raidhelper is set to pre-war meeting time)

export class RaidhelperIntegration {
    // TODO: save messageId and channelId of created raidhelper events (can be retrieved from api response) into the db as well
    // TODO: when the bot starts load all event messages into memory and attach a collector to see when the message is deleted
    // TODO: this makes it so no events will ever not be in sync, additionaly to capture events created during bot downtime an auto refresh could be performaed at bot start (will have to be careful with rate-limits on raidhelper API)
    public static startListening(client: Client): void {
        client
            .on('messageCreate', async (message) => {
                if (!message.guild || message.type !== MessageType.Default || message.member?.user.id !== RAIDHELPER_USER_ID) return;
                await setTimeout(5000); // Give raidhelper API time to update
                const dbGuild = await Database.getGuild(message.guild).catch(() => undefined);
                // if the message is from raidhelper but not posted in the specified event channel return
                if (!dbGuild || !dbGuild.raidHelper.apiKey || dbGuild.raidHelper.eventChannelId && dbGuild?.raidHelper.eventChannelId !== message.channel.id) return;
                logger.info(`[${message.guild?.name}] raidhelper created`);

                let events: ScheduledEvent[];
                try {
                    events = await RaidhelperIntegration.getEvents(dbGuild);
                } catch (e) {
                    await RaidhelperIntegration.handleUpdateEventError(
                        message.guild,
                        dbGuild,
                        'Error while trying to schedule a Raidhelper event.\nCheck your Raidhelper Integration settings in `/settings`'
                    );
                    return;
                }
                await RaidhelperIntegration.sendEventNotifications(message.guild, dbGuild, events, [...dbGuild.raidHelper.events])
                    .then(() => dbGuild.raidHelper.events = events)
                    .then(() => dbGuild.save())
                    .catch(logger.error);

                const widget = await Widget.find(
                    message.guild,
                    dbGuild.widget.messageId,
                    dbGuild.widget.channelId
                )
                if (!widget?.textState) {
                    await widget?.update({ force: true });
                }
            })
            .on('messageDelete', async (message) => {
                if (!message.guild || message.type !== MessageType.Default || message.member?.user.id !== RAIDHELPER_USER_ID) return;
                await setTimeout(5000); // Give raidhelper API time to update
                const dbGuild = await Database.getGuild(message.guild).catch(() => undefined);
                if (!dbGuild || !dbGuild.raidHelper.apiKey) return;
                logger.info(`[${message.guild?.name}] raidhelper deleted`);

                let events: ScheduledEvent[];
                try {
                    events = await RaidhelperIntegration.getEvents(dbGuild);
                } catch (e) {
                    await RaidhelperIntegration.handleUpdateEventError(
                        message.guild,
                        dbGuild,
                        'Error while trying to deschedule a Raidhelper event.\nCheck your Raidhelper Integration settings in `/settings`'
                    );
                    return;
                }
                await RaidhelperIntegration.sendEventNotifications(message.guild, dbGuild, events, [...dbGuild.raidHelper.events])
                    .then(() => dbGuild.raidHelper.events = events)
                    .then(() => dbGuild.save())
                    .catch(logger.error);

                const widget = await Widget.find(
                    message.guild,
                    dbGuild.widget.messageId,
                    dbGuild.widget.channelId
                )
                if (!widget?.textState) {
                    await widget?.update({ force: true });
                }
            });
    }
    private static async handleUpdateEventError(guild: Guild | null, dbGuild: DBGuild, message: string): Promise<void> {
        try {
            dbGuild.raidHelper.apiKeyValid = false;
            await dbGuild.save();
            if (guild) {
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
                if (!widget?.textState) {
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
        }

        // Check for new events and notify
        const newEvents = events.filter((event) => !oldEvents.find((oldEvent) => oldEvent.id === event.id));
        if (newEvents.length !== 0) {
            await this.notifyScheduledEvents(newEvents, dbGuild, guild);
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
            `${info}\n${scheduledEvents.map((event) => `- ${event}`).join('\n')}`,
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
        const descheduledEventStrings = events.map((event) => {
            const time = '🗓️ ' + `<t:${event.startTimeUnix}:d>` + ' 🕑 ' + `<t:${event.startTimeUnix}:t>`;
            return `- 📝  ${event.title}  ${time}`;
        });
        await NotificationHandler.sendNotification(guild, dbGuild,
            `**Event${events.length > 1 ? 's' : ''} Descheduled**`,
            `${descheduledEventStrings.map((event) => `- ${event}`).join('\n')}`,
            { color: Colors.Orange, byPassDuplicateCheck: true });
    }
    public static async interval(client: Client): Promise<void> {
        const date = new Date();
        const [minutes, seconds] = [date.getMinutes(), date.getSeconds(), date.getHours()];

        // TODO: add logic for 10 minutes before each war that checks if any upcoming events have problematic channel permissions and sends a notification if that's the case
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
                await RaidhelperIntegration.descheduledOldEvents(guilds)
                    .catch(logger.error);
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
                        if (!audioManager.isConnected(guild.client.id) && guild.db.raidHelper.enabled) {
                            let channel;
                            if (event.voiceChannelId) {
                                channel = await guild.client.channels.fetch(event.voiceChannelId);
                            } else if (guild.db.raidHelper.defaultVoiceChannelId) {
                                channel = await guild.client.channels.fetch(guild.db.raidHelper.defaultVoiceChannelId);
                            }


                            if (!channel) return Promise.reject('No voice channel specified in event and no default voice channel set');
                            if (!channel.isVoiceBased()) return Promise.reject(`${channel} is not a voice channel.`);

                            await (widget ?
                                widget.toggleVoice({
                                    dbGuild: guild.db,
                                    channel
                                }) : audioManager.connect(channel, guild.db));
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
                                if (widget.textState) return; // It's already on
                                await widget.toggleText({ dbGuild: guild.db, forceOn: true });
                            } else {
                                await NotificationHandler.sendNotification(
                                    guild.client,
                                    guild.db,
                                    `Widget Error`,
                                    `Error while attempting to enable text-widget\nfor scheduled event **${event.title}**\n\n**Unable to find a text-widget**`
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
    private static async descheduledOldEvents(guilds: {
        db: DBGuild;
        client: Guild | undefined;
    }[],): Promise<void> {
        // Filter out past events and potentially notify about unlisting
        for (const guild of guilds) {
            const oldEvents = [...guild.db.raidHelper.events];
            guild.db.raidHelper.events = guild.db.raidHelper.events.filter((event) => {
                // Past events = negative diff, Future events = positive diff
                const diff = event.startTimeUnix * 1000 - Date.now();
                const diffMinutes = diff / 1000 / 60;

                const isWithinPastThreshold = diffMinutes > (RETRY_ATTEMPT_DUR + GRACE_PERIOD_MINUTES) * -1;
                return isWithinPastThreshold;
            });
            if (guild.client) {
                await RaidhelperIntegration.sendEventNotifications(guild.client, guild.db, guild.db.raidHelper.events, oldEvents)
                    .catch(logger.error);
            }
            await guild.db.save().catch(() => logger.error(`[${guild.db.name}] Unable to clear old events`));
        }
    }
    /**
     * Retrieves current events, saves them to the guild object in db
     * and returns the events
     * @param guild 
     * @returns 
     */
    public static async getEvents(dbGuild: DBGuild): Promise<ScheduledEvent[]> {
        if (!dbGuild.raidHelper.apiKey) {
            return Promise.reject('Raidhelper API Key not set.');
        }
        const serversEventsUrl = `https://raid-helper.dev/api/v3/servers/${dbGuild.id}/events`;
        const header = new Headers();
        header.set('Authorization', dbGuild.raidHelper.apiKey);
        header.set('IncludeSignups', 'false');
        header.set('StartTimeFilter', Math.round(Date.now() / 1000 - 60 * GRACE_PERIOD_MINUTES).toString());
        if (dbGuild.raidHelper.eventChannelId) {
            header.set('ChannelFilter', dbGuild.raidHelper.eventChannelId);
        }

        return fetch(serversEventsUrl, {
            headers: header
        })
            .then((res) => res.ok ? res : Promise.reject(res))
            .then((res) => res.json())
            .then(async (data: {
                postedEvents?: ScheduledEvent[];
            }) => Promise.all(data.postedEvents?.map((event) =>
                fetch(`https://raid-helper.dev/api/v2/events/${event.id}`, { headers: header })
                    .then((res) => res.ok ? res : Promise.reject(res))
                    .then((res) => res.json())
                    .then((event: RaidhelperAPIEvent) => ({ // Need to map to new object so the entire event object doesn't get saved to databse
                        id: event.id,
                        startTimeUnix: event.startTime,
                        title: event.title,
                        voiceChannelId: event.advancedSettings.voice_channel.match(/^[0-9]+$/) ? event.advancedSettings.voice_channel : undefined,
                    } as ScheduledEvent))) ?? []));
    }
}
export default new RaidhelperIntegration();