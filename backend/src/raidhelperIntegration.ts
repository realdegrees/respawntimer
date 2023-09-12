import { setTimeout } from 'timers/promises';
import { RaidhelperEvent } from './common/types/raidhelperEvent';
import { GuildData, queryGuilds } from './db/guild.schema';
import { Client, Guild, TextBasedChannel, VoiceBasedChannel } from 'discord.js';
import { Document } from 'mongoose';
import logger from '../lib/logger';
import { WarInfo } from './common/types';
import { Widget } from './common/widget';
import audioManager from './util/audioManager';
import { NotificationHandler } from './notificationHandler';

const POLL_INTERVAL_MS = 300000;
export class RaidhelperIntegration {
    public constructor() {
        queryGuilds({
            'raidHelper.enabled': { $eq: true }
        }).then((guilds) => {
            guilds.forEach(async (guild) => {
                await this.getEvents(guild)
                    .catch((e) => logger.error(e));
                await setTimeout(500);
            });
        });
        setInterval(() => {
            queryGuilds({
                'raidHelper.enabled': { $eq: true }
            }).then((guilds) => {
                guilds.forEach(async (guild) => {
                    await this.getEvents(guild)
                        .catch((e) => logger.error(e));
                    await setTimeout(500);
                });
            });
        }, POLL_INTERVAL_MS);
    }
    public interval(info: WarInfo, client: Client): void {
        if (info.war.timeLeftSeconds === 1800) {
            queryGuilds({
                'raidHelper.enabled': { $eq: true }
            }).then((guilds) => {
                logger.debug(guilds.length + ' guilds with raidhelper enabled');
                return guilds.filter((guild) => guild.raidHelper.events.find((event) =>
                    event.startTime && Math.abs(new Date(new Date(event.startTime).getTime() - Date.now()).getTime() / 1000 / 60) < 20
                ));
            }).then((dbGuilds) => {
                logger.debug(dbGuilds.length + ' guilds with a scheduled event');
                const clientGuilds = client.guilds.cache.filter((guild) => !!dbGuilds.find((el) => el.id === guild.id));
                dbGuilds.forEach(async (dbGuild) => {
                    const event = dbGuild.raidHelper.events.reduce((lowest, current) =>
                        new Date(new Date(current.startTime).getTime() - Date.now()).getTime() <
                            new Date(new Date(lowest.startTime).getTime() - Date.now()).getTime() ? current : lowest);

                    const guild = clientGuilds.find((cg) => cg.id === dbGuild.id);

                    if (!guild) {
                        await NotificationHandler.sendNotification(
                            dbGuild.id, `Tried to join a voice channel for scheduled event '${event.title}' but encountered an error\n
                            Unable to retrieve server data! Try resetting your server's data in the settings.`
                        ).catch(logger.error);
                        return;
                    }

                    const voiceChannel = event.voiceChannelId ?
                        await guild.channels.fetch(event.voiceChannelId) as VoiceBasedChannel | undefined :
                        dbGuild.raidHelper.defaultVoiceChannelId ?
                            await guild.channels.fetch(dbGuild.raidHelper.defaultVoiceChannelId) as VoiceBasedChannel | undefined :
                            undefined;
                    const widgetChannel = dbGuild.widget.channelId ?
                        await guild.channels.fetch(dbGuild.widget.channelId) as TextBasedChannel | undefined : undefined;
                    const message = dbGuild.widget.messageId ? await widgetChannel?.messages.fetch().then((messages) =>
                        messages.find((message) => message.id === dbGuild.widget.messageId)) : undefined;

                    if (!voiceChannel) {
                        // no voice channelset in event and no default voice channel set in settings
                        NotificationHandler.sendNotification(
                            guild, `Scheduled event '${event.title}' triggered but there is no voice channel to join.  
                            Please set a default voice channel or add a voice channel in the raidhelper settings when creating an event.`).catch(logger.error);
                        return;
                    }
                    if (!message) {
                        // no primary widget
                        await audioManager.connect(voiceChannel, () => Promise.resolve(), dbGuild.voice)
                            .catch((reason) => NotificationHandler.sendNotification(
                                guild, `Tried to join ${voiceChannel} for scheduled event '${event.title}' but encountered an error\n${reason}`
                            )).catch(logger.error);
                        return;
                    }
                    const widget = await Widget.get(message);
                    // do not await
                    widget.toggleVoice({
                        voice: dbGuild.voice,
                        channel: voiceChannel
                    }).catch((reason) => NotificationHandler.sendNotification(
                        guild, `Tried to join ${voiceChannel} for scheduled event '${event.title}' but encountered an error\n${reason}`
                    )).catch(logger.error);
                    await setTimeout(100);
                });
            });
        }
    }
    /**
     * Retrieves current events, saves them to the guild object in db
     * and returns the events
     * @param guild 
     * @returns 
     */
    public async getEvents(dbGuild: (Document<unknown, object, GuildData> & GuildData & Required<{
        _id: string;
    }>)): Promise<RaidhelperEvent[]> {
        if (!dbGuild.raidHelper.apiKey) {
            return Promise.reject('Raidhelper API Key not set.');
        }
        const serversEventsUrl = `https://raid-helper.dev/api/v3/servers/${dbGuild.id}/events`;
        const header = new Headers();
        header.set('Authorization', dbGuild.raidHelper.apiKey);
        header.set('IncludeSignups', 'false');
        header.set('StartTimeFilter', Math.round(Date.now() / 1000 - 60 * 16).toString()); // Unix timestamp to only get future events (-16 minutes to include events that might have start time set to war invites)
        if (dbGuild.raidHelper.eventChannelId) {
            header.set('ChannelFilter', dbGuild.raidHelper.eventChannelId);
        }

        return fetch(serversEventsUrl, {
            headers: header
        })
            .then((res) => res.json())
            .then(async (data: {
                postedEvents?: RaidhelperEvent[];
            }) => {
                const events = await Promise.all(data.postedEvents?.map(async (event) =>
                    await fetch(`https://raid-helper.dev/api/v2/events/${event.id}`, { headers: header })
                        .then((res) => res.json())
                        .then((event: RaidhelperEvent & { advancedSettings: { voice_channel: string } }) => ({ // Need to map to new object so the entire event object doesn't get saved to databse
                            id: event.id,
                            startTime: event.startTime * 1000,
                            title: event.title,
                            voiceChannelId: event.advancedSettings.voice_channel.match(/^[0-9]+$/) ? event.advancedSettings.voice_channel : undefined,
                        } as RaidhelperEvent))) ?? []);

                dbGuild.raidHelper.events = events;
                return dbGuild.save();
            })
            .then((dbGuild) => dbGuild.raidHelper.events);
    }
    public async checkApiKey(guild: Guild, apiKey: string): Promise<boolean> {
        return new Promise((res) => {
            const url = `https://raid-helper.dev/api/v3/servers/${guild.id}/events`;
            const header = new Headers();
            header.set('Authorization', apiKey);

            fetch(url, {
                headers: header
            })
                .then((response) => {
                    res(response.ok);
                })
                .catch(() => {
                    res(false);
                });
        });
    }
}
export default new RaidhelperIntegration();