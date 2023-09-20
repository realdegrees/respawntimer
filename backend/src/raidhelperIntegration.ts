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

const RETRY_ATTEMPT_DUR = 3;
const RETRY_INTERVAL_SECONDS = 5;
const RAIDHELPER_USER_ID = "579155972115660803"

export class RaidhelperIntegration {
    // TODO: save messageId and channelId of created raidhelper events (can be retrieved from api response) into the db as well
    // TODO: when the bot starts load all event messages into memory and attach a collector to see when the message is deleted
    // TODO: this makes it so no events will ever not be in sync, additionaly to capture events created during bot downtime an auto refresh could be performaed at bot start (will have to be careful with rate-limits on raidhelper API)
    public static startListening(client: Client): void {
        client
            .on('messageCreate', async (message) => {
                if (!message.guild || message.type !== MessageType.Default || message.member?.user.id !== RAIDHELPER_USER_ID) return;
                await setTimeout(7000); // Give raidhelper API time to update
                const dbGuild = await Database.getGuild(message.guild).catch(() => undefined);
                // if the message is from raidhelper but not posted in the specified event channel return
                if (!dbGuild || !dbGuild.raidHelper.apiKey || dbGuild.raidHelper.eventChannelId && dbGuild?.raidHelper.eventChannelId !== message.channel.id) return;
                logger.info(`[${message.guild?.name}] raidhelper created`);
                RaidhelperIntegration.updateEventStatus(message.guild, dbGuild)
                    .catch(() => {
                        if (message.guild) {
                            NotificationHandler.sendNotification(message.guild, dbGuild, 'Raidhelper Integration Error', 'Error while trying to schedule a Raidhelper event.\nCheck your Raidhelper Integration settings in `/settings`')
                        }
                        dbGuild.raidHelper.apiKeyValid = false;
                        return dbGuild.save();
                    }).catch(logger.error);
            })
            .on('messageDelete', async (message) => {
                if (!message.guild || message.type !== MessageType.Default || message.member?.user.id !== RAIDHELPER_USER_ID) return;
                await setTimeout(7000); // Give raidhelper API time to update
                const dbGuild = await Database.getGuild(message.guild).catch(() => undefined);
                if (!dbGuild || !dbGuild.raidHelper.apiKey) return;
                logger.info(`[${message.guild?.name}] raidhelper deleted`);
                RaidhelperIntegration.updateEventStatus(message.guild, dbGuild)
                    .catch(() => {
                        if (message.guild) {
                            NotificationHandler.sendNotification(message.guild, dbGuild, 'Raidhelper Integration Error', 'Error while trying to schedule a Raidhelper event.\nCheck your Raidhelper Integration settings in `/settings`')
                        }
                        dbGuild.raidHelper.apiKeyValid = false;
                        return dbGuild.save();
                    }).catch(logger.error);
            })
    }
    public static async updateEventStatus(guild: Guild, dbGuild: DBGuild): Promise<void> {
        logger.info(`[${guild.name}] requesting raidhelper events`);
        await RaidhelperIntegration.getEvents(dbGuild)
            .then(async (events) => {
                if (!dbGuild) return Promise.reject();
                const oldEvents = [...dbGuild.raidHelper.events];
                dbGuild.raidHelper.events = events;
                dbGuild.raidHelper.apiKeyValid = true;
                await dbGuild.save();
                if (guild) {
                    await Widget.find(
                        guild,
                        dbGuild.widget.messageId,
                        dbGuild.widget.channelId
                    ).then((widget) => {
                        if (!widget?.textState) {
                            widget?.update({ force: true });
                        }
                    }).catch(logger.error);
                }
                return [events, oldEvents];
            })
            .then(async ([events, oldEvents]) => {
                logger.info(`[${guild.name}] raidhelper events request success`);
                if (oldEvents.every((oldEvent) => events.find((event) => event.id === oldEvent.id)) &&
                    events.every((event) => oldEvents.find((oldEvent) => event.id === oldEvent.id))) return;
                // Check for old events that have been descheduled and notify
                const descheduledEvents = oldEvents.filter((event) => !events.find((newEvent) => newEvent.id === event.id));
                if (descheduledEvents.length !== 0 && guild) {
                    const descheduledEventStrings = descheduledEvents.map((event) => {
                        const time = '🗓️ ' + `<t:${event.startTime}:d>` + ' 🕑 ' + `<t:${event.startTime}:t>`;
                        return `- 📝  ${event.title}  ${time}`;
                    });
                    await NotificationHandler.sendNotification(guild, dbGuild,
                        `**Event${descheduledEvents.length > 1 ? 's' : ''} Descheduled**`,
                        `${descheduledEventStrings.join('\n')}`,
                        { color: Colors.Orange, byPassDuplicateCheck: true });
                }

                // Check for new events and notify
                const newEvents = events.filter((event) => !oldEvents.find((oldEvent) => oldEvent.id === event.id));
                if (newEvents.length !== 0) {
                    await Promise.all(newEvents.map(async (event) => {
                        const voiceChannel = event.voiceChannelId ?
                            await guild.channels
                                .fetch(event.voiceChannelId)
                                .catch(() => undefined) : undefined;
                        const time = '🗓️ ' + `<t:${event.startTime}:d>` + ' 🕑 ' + `<t:${event.startTime}:t>`;
                        const voiceChannelPermissions = voiceChannel?.isVoiceBased() ? await checkChannelPermissions(voiceChannel, ['ViewChannel', 'Connect', 'Speak'])
                            .then(() => '')
                            .catch(() => `⚠️`) : '';
                        return `- 📝  ${event.title}  ${time}${voiceChannel ? `  🔗 ${voiceChannel} ${voiceChannelPermissions}` : ''}`;
                    }))
                        .then((scheduledEvents) => {
                            const info = `${scheduledEvents.some((ev) => ev.includes('⚠️')) ? ' ≫ *Missing Some Permissions*' : ''}`;
                            return NotificationHandler.sendNotification(
                                guild, dbGuild,
                                `** New Event${newEvents.length > 1 ? 's' : ''} Scheduled**`,
                                `${info}\n${scheduledEvents.join('\n')}`,
                                { color: Colors.Green, byPassDuplicateCheck: true });
                        });
                }
            })
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
                // Get guilds with an API Key from DB and filter out those with events starting soon
                const guilds = (await Database.queryGuilds({
                    'raidHelper.apiKey': { $exists: true }
                }))
                    .filter((guild) =>
                        guild.raidHelper.events.find((event) => {
                            const diff = event.startTime * 1000 - Date.now();
                            const diffSeconds = diff / 1000;
                            const diffMinutes = diffSeconds / 60;
                            return event.startTime && diffSeconds < 30 && diffMinutes > -20;
                        }))
                    .map((dbGuild) => ({
                        db: dbGuild,
                        client: client.guilds.cache.find((clientGuild) => clientGuild.id === dbGuild.id)
                    }));

                // for each guild find the closest event and attempt to start the widget and voice
                for (const guild of guilds) {
                    if (!guild.client) return;
                    if (!guild.db.raidHelper.enabled && !guild.db.raidHelper.widget) return;
                    const event = guild.db.raidHelper.events.reduce((lowest, current) =>
                        Math.abs(current.startTime * 1000 - Date.now()) < Math.abs(lowest.startTime * 1000 - Date.now()) ? current : lowest);

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
    /**
     * Retrieves current events, saves them to the guild object in db
     * and returns the events
     * @param guild 
     * @returns 
     */
    private static async getEvents(dbGuild: DBGuild): Promise<ScheduledEvent[]> {
        if (!dbGuild.raidHelper.apiKey) {
            return Promise.reject('Raidhelper API Key not set.');
        }
        const serversEventsUrl = `https://raid-helper.dev/api/v3/servers/${dbGuild.id}/events`;
        const header = new Headers();
        header.set('Authorization', dbGuild.raidHelper.apiKey);
        header.set('IncludeSignups', 'false');
        header.set('StartTimeFilter', Math.round(Date.now() / 1000 - 60 * 20).toString());
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
                        startTime: event.startTime,
                        title: event.title,
                        voiceChannelId: event.advancedSettings.voice_channel.match(/^[0-9]+$/) ? event.advancedSettings.voice_channel : undefined,
                    } as ScheduledEvent))) ?? []));
    }
}
export default new RaidhelperIntegration();