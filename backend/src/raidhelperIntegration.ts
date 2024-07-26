import { setTimeout } from 'timers/promises';
import { RaidhelperEvent } from './common/types/raidhelperEvent';
import { queryGuilds } from './db/guild.schema';
import { Client, Guild, TextBasedChannel, VoiceBasedChannel } from 'discord.js';
import logger from '../lib/logger';
import { Widget } from './common/widget';
import audioManager from './util/audioManager';
import { NotificationHandler } from './notificationHandler';
import { DBGuild } from './common/types/dbGuild';

export class RaidhelperIntegration {

    public interval(client: Client): void {
        const date = new Date();
        const [minutes, seconds] = [date.getMinutes(), date.getSeconds()];

        if ((minutes === 0 || minutes === 30) && seconds === 0) {
            queryGuilds({
                $or: [
                    { 'raidHelper.enabled': { $eq: true } },
                    { 'raidHelper.widget': { $eq: true } }
                ]
            }).then((guilds) => {
                return Promise.all(guilds.map((guild, index) => setTimeout(index * 1000).then(() => this.getEvents(guild))))
                    .then(() => {
                        return guilds.filter((guild) => guild.raidHelper.events.find((event) =>
                            // startTIme is in unix so need to multiplay by 1000
                            event.startTime && (event.startTime * 1000 - Date.now()) / 1000 / 60 < 1 && (event.startTime * 1000 - Date.now()) / 1000 / 60 > -20
                        ));
                    });
            }).then((dbGuilds) => {
                const clientGuilds = client.guilds.cache.filter((guild) => !!dbGuilds.find((el) => el.id === guild.id));
                dbGuilds.forEach(async (dbGuild) => {
                    const event = dbGuild.raidHelper.events.reduce((lowest, current) =>
                        Math.abs(current.startTime * 1000 - Date.now()) < Math.abs(lowest.startTime * 1000 - Date.now()) ? current : lowest);

                    const guild = clientGuilds.find((cg) => cg.id === dbGuild.id);

                    if (!guild) {
                        return NotificationHandler.sendNotification(
                            dbGuild.id, `Tried to take action for scheduled event '${event.title}' but encountered an error\n
                            Unable to retrieve server data! Try resetting your server's data in the settings.`                        )
                            .then((res) => res.type === 'error' ? Promise.reject(res.info) : Promise.resolve())
                            .catch(logger.error);
                    }

                    const voiceChannel = event.voiceChannelId ?
                        await guild.channels.fetch(event.voiceChannelId).catch(() => undefined) as VoiceBasedChannel | undefined :
                        dbGuild.raidHelper.defaultVoiceChannelId ?
                            await guild.channels.fetch(dbGuild.raidHelper.defaultVoiceChannelId).catch(() => undefined) as VoiceBasedChannel | undefined :
                            undefined;
                    const widgetChannel = dbGuild.widget.channelId ?
                        await guild.channels.fetch(dbGuild.widget.channelId).catch(() => undefined) as TextBasedChannel | undefined : undefined;
                    const widgetMessage = dbGuild.widget.messageId ? await widgetChannel?.messages.fetch().then((messages) =>
                        messages.find((message) => message.id === dbGuild.widget.messageId)).catch(() => undefined) : undefined;

                    if (!voiceChannel && dbGuild.raidHelper.enabled) {
                        // no voice channelset in event and no default voice channel set in settings
                        await NotificationHandler.sendNotification(
                            guild, `Scheduled event '${event.title}' triggered but there is no voice channel to join.  
                            Please set a default voice channel or add a voice channel in the raidhelper settings when creating an event.`)
                            .then((res) => res.type === 'error' ? Promise.reject(res.info) : Promise.resolve())
                            .catch(logger.error);
                    }
                    if (!widgetMessage && dbGuild.raidHelper.widget) {
                        // no voice channelset in event and no default voice channel set in settings
                        await NotificationHandler.sendNotification(
                            guild, `Scheduled event '${event.title}' triggered but there is no widget to toggle.  
                            Please create a widget or turn off the Auto-Widget feature in the Raidhelper settings.`)
                            .then((res) => res.type === 'error' ? Promise.reject(res.info) : Promise.resolve())
                            .catch(logger.error);
                    }

                    if (widgetMessage) {
                        await Widget.get(widgetMessage).then((widget) => {
                            return widget ? Promise.all([
                                new Promise((res, rej) => {
                                    dbGuild.raidHelper.enabled ? widget.toggleVoice({
                                        dbGuild,
                                        channel: voiceChannel
                                    }).then(res).catch(rej) : res(undefined);
                                }),
                                new Promise((res, rej) => {
                                    dbGuild.raidHelper.widget ? widget.toggleText({ dbGuild, forceOn: true })
                                        .then(res)
                                        .catch(rej) : res(undefined);
                                })
                            ]) : Promise.reject('Widget not found');
                        }).catch((reason) => NotificationHandler.sendNotification(
                            guild, `Tried to join ${voiceChannel} for scheduled event '${event.title}' but encountered an error\n${reason}`
                        ).then((res) => res.type === 'error' ? Promise.reject(res.info) : Promise.resolve())).catch(logger.error);

                    } else if (voiceChannel && dbGuild.raidHelper.enabled) {
                        return audioManager.connect(voiceChannel, () => Promise.resolve(), dbGuild)
                            .catch((reason) => NotificationHandler.sendNotification(
                                guild, `Tried to join ${voiceChannel} for scheduled event '${event.title}' but encountered an error\n${reason}`
                            ).then((res) => res.type === 'error' ? Promise.reject(res.info) : Promise.resolve())).catch(logger.error);
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
    public async getEvents(dbGuild: DBGuild): Promise<RaidhelperEvent[]> {
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
            }) => Promise.all(data.postedEvents?.map((event) =>
                fetch(`https://raid-helper.dev/api/v2/events/${event.id}`, { headers: header })
                    .then((res) => res.json())
                    .then((event: RaidhelperEvent & { advancedSettings: { voice_channel: string } }) => ({ // Need to map to new object so the entire event object doesn't get saved to databse
                        id: event.id,
                        startTime: event.startTime,
                        title: event.title,
                        voiceChannelId: event.advancedSettings.voice_channel.match(/^[0-9]+$/) ? event.advancedSettings.voice_channel : undefined,
                    } as RaidhelperEvent))) ?? []));
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