import { setTimeout } from 'timers/promises';
import { RaidhelperAPIEvent, ScheduledEvent } from './common/types/raidhelperEvent';
import { Client, Colors, Guild, Message, MessageType, PartialMessage } from 'discord.js';
import logger from '../lib/logger';
import { Widget } from './common/widget';
import audioManager from './util/audioManager';
import { NotificationHandler } from './handlers/notificationHandler';
import { DBGuild } from './common/types/dbGuild';
import { checkChannelPermissions } from './util/permissions';
import Database from './db/database';

const RETRY_ATTEMPT_DUR = 3;
const RETRY_INTERVAL_SECONDS = 5;
const RAIDHELPER_USER_ID = "579155972115660803"

export class RaidhelperIntegration {
    // TODO: instead of checking on an interval basis check for messages from raidhelper (either in event channel or global if not set) and request events only for that guild
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
        await RaidhelperIntegration.getEvents(dbGuild)
            .then(async (events) => {
                if (!dbGuild) return Promise.reject();
                const oldEvents = [...dbGuild.raidHelper.events];
                dbGuild.raidHelper.events = events;
                dbGuild.raidHelper.apiKeyValid = true;
                await dbGuild.save();
                if (guild) {
                    await Widget.find({
                        guild,
                        messageId: dbGuild.widget.messageId,
                        channelId: dbGuild.widget.channelId
                    }).then((widget) => {
                        if (!widget?.textState) {
                            widget?.update({ force: true });
                        }
                    }).catch(logger.error);
                }
                return [events, oldEvents];
            })
            .then(async ([events, oldEvents]) => {
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
    public static interval(client: Client): void {
        const date = new Date();
        const [minutes, seconds] = [date.getMinutes(), date.getSeconds(), date.getHours()];

        // TODO: add logic for 10 minutes before each war that checks if any upcoming events have problematic channel permissions and sends a notification if that's the case
        // Only run within the first RETRY_ATTEMPT_DUR after war begin and every RETRY_INTERVAL_SECONDS seconds
        if (minutes >= 0 && minutes < RETRY_ATTEMPT_DUR ||
            minutes >= 30 && minutes < 30 + RETRY_ATTEMPT_DUR &&
            seconds % RETRY_INTERVAL_SECONDS === 0) {
            Database.queryGuilds({
                'raidHelper.apiKey': { $exists: true }
            }).then((dbGuilds) =>
                dbGuilds.filter((guild) =>
                    guild.raidHelper.events.find((event) => {
                        const diff = event.startTime * 1000 - Date.now();
                        const diffSeconds = diff / 1000;
                        const diffMinutes = diffSeconds / 60;
                        // startTIme is in unix so need to multiplay by 1000
                        return event.startTime && diffSeconds < 30 && diffMinutes > -20;
                    }))
            ).then((dbGuilds) => {
                if (dbGuilds.length === 0) return;
                const clientGuilds = client.guilds.cache.filter((clientGuild) => !!dbGuilds.find((dbGuild) => dbGuild.id === clientGuild.id));
                dbGuilds.forEach(async (dbGuild) => {
                    if (!dbGuild.raidHelper.enabled && !dbGuild.raidHelper.widget) return;
                    const event = dbGuild.raidHelper.events.reduce((lowest, current) =>
                        Math.abs(current.startTime * 1000 - Date.now()) < Math.abs(lowest.startTime * 1000 - Date.now()) ? current : lowest);
                    const guild = clientGuilds.find((cg) => cg.id === dbGuild.id);
                    if (!guild) return;

                    const widget = await Widget.find({
                        guild,
                        messageId: dbGuild.widget.messageId,
                        channelId: dbGuild.widget.channelId
                    });
                    // Connect to voice if not connected and auto-join is enabled
                    if (!audioManager.isConnected(guild.id) && dbGuild.raidHelper.enabled) {
                        await Promise.resolve().then(() => {
                            if (event.voiceChannelId) {
                                return guild.channels.fetch(event.voiceChannelId);
                            } else if (dbGuild.raidHelper.defaultVoiceChannelId) {
                                return guild.channels.fetch(dbGuild.raidHelper.defaultVoiceChannelId);
                            } else return undefined;
                        })
                            .then((channel) => {
                                if (!channel) return Promise.reject('No voice channel specified in event and no default voice channel set');
                                if (!channel.isVoiceBased()) return Promise.reject(`${channel} is not a voice channel.`);

                                return widget ? widget.toggleVoice({
                                    dbGuild,
                                    channel
                                }) : audioManager.connect(channel, dbGuild);
                            })
                            .catch((reason) =>
                                NotificationHandler.sendNotification(
                                    guild, dbGuild, `Voice Error`, `Error while attempting to join channel\nfor scheduled event **${event.title}**\n\n${reason?.toString()}`
                                ).then((res) => res.type === 'error' ? Promise.reject(res.info) : Promise.resolve()))
                            .catch(logger.error);
                    }
                    // Attempt to start widget if auto-widget is enabled
                    if (dbGuild.raidHelper.widget) {
                        if (widget) {
                            if (widget.textState) return; // It's already on
                            await widget.toggleText({ dbGuild, forceOn: true })
                                .catch((reason) => NotificationHandler.sendNotification(
                                    guild, dbGuild, `Widget Error`, `Error while attempting to enable text-widget\nfor scheduled event **${event.title}**\n\n${reason?.toString()}`
                                ).then((res) => res.type === 'error' ? Promise.reject(res.info) : Promise.resolve())).catch(logger.error);
                        } else {
                            await NotificationHandler.sendNotification(
                                guild, dbGuild, `Widget Error`, `Error while attempting to enable text-widget\nfor scheduled event **${event.title}**\n\n**Unable to find a text-widget**`)
                                .then((res) => res.type === 'error' ? Promise.reject(res.info) : Promise.resolve())
                                .catch(logger.error);
                        }
                    }
                });
            }).catch(logger.error);
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