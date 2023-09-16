import { Client, ColorResolvable, Colors, EmbedBuilder, Guild } from 'discord.js';
import { getGuild, queryGuilds } from './db/guild.schema';
import { setTimeout } from 'timers/promises';
import logger from '../lib/logger';
import { WARTIMER_ICON_LINK } from './common/constant';

type NotificationResponse = {
    type: 'sent' | 'nochannel' | 'error' | 'duplicate';
    info?: string;
};

const DUPLICATE_PROTECTION_STRENGTH = 3; // How many previous notifications should be checked for duplicates
const notificationMap: { guildId: string; notifications: string[]; logs: string[] }[] = [];
const sourceServerId = '979269592360837120'; // Wartimer Development Server
const sourceChannelId = '1151202146268741682'; // Wartimer Development Server Update Channel

export class NotificationHandler {
    public constructor(client: Client) {
        client.on('messageCreate', (message) => {
            if (message.channel.id === sourceChannelId && message.guild?.id === sourceServerId) {
                queryGuilds({
                    'notificationChannelId': { $regex: /\d+/ }
                }).then((dbGuilds) => {
                    dbGuilds.forEach((dbGuild) => {
                        client.guilds.fetch(dbGuild.id)
                            .then((guild) => dbGuild.notificationChannelId ? guild.channels.fetch(dbGuild.notificationChannelId) : undefined)
                            .then(async (channel) =>
                                !channel || !channel.isTextBased() ?
                                    Promise.reject() :
                                    message.fetch()
                                        .then((message) => channel.send({
                                            embeds: message.embeds
                                        }))
                                        .then(() => setTimeout(2000))
                            ).catch((e) => {
                                logger.error(e);
                                dbGuild.notificationChannelId = undefined;
                                return dbGuild.save();
                            });
                    });
                });
            }
        });
    }
    public static async sendNotification(guild: Guild, title: string, text: string, color?: ColorResolvable): Promise<NotificationResponse> {
        const previousGuildNotificationMap = notificationMap.find((prev) => prev.guildId === guild.id);
        if (previousGuildNotificationMap?.notifications.includes([title, text].join())) {
            return Promise.resolve({
                type: 'duplicate'
            });
        }
        return getGuild(guild).then((dbGuild) => dbGuild.notificationChannelId ?
            guild.channels.fetch(dbGuild.notificationChannelId)
                .then(async (channel) => {
                    if (!channel || !channel.isTextBased()) {
                        dbGuild.notificationChannelId = undefined;
                        return dbGuild.save().then(() => Promise.reject(text));
                    } else {
                        return channel.send({
                            embeds: [
                                new EmbedBuilder()
                                    .setAuthor({ iconURL: WARTIMER_ICON_LINK, name: 'Wartimer Notification' })
                                    .setTitle(title)
                                    .setDescription(text)
                                    .setColor(color ?? Colors.Red)
                                    .setTimestamp(Date.now())
                            ]
                        }).then(() => {
                            if (!previousGuildNotificationMap) {
                                notificationMap.push({
                                    guildId: guild.id,
                                    notifications: [[title, text].join()],
                                    logs: []
                                });
                            } else {
                                if (previousGuildNotificationMap.notifications.length >= DUPLICATE_PROTECTION_STRENGTH) {
                                    previousGuildNotificationMap.notifications.pop();
                                }
                                previousGuildNotificationMap.notifications.push([title, text].join());
                            }
                        });
                    }
                }).then(() => ({
                    type: 'sent'
                } as NotificationResponse))
                .catch((e) => ({
                    type: 'error',
                    info: e.toString()
                } as NotificationResponse)) : new Promise((res) => {
                    if (!previousGuildNotificationMap?.logs.includes([title, text].join())) {
                        logger.debug('[' + guild.name + '] Notification: ' + text);

                        if (!previousGuildNotificationMap) {
                            notificationMap.push({
                                guildId: guild.id,
                                notifications: [],
                                logs: [[title, text].join()]
                            });
                        } else {
                            if (previousGuildNotificationMap.logs.length >= DUPLICATE_PROTECTION_STRENGTH) {
                                previousGuildNotificationMap.logs.pop();
                            }
                            previousGuildNotificationMap.logs.push([title, text].join());
                        }
                    }                    
                    res({ type: 'nochannel' });
                }));
    }
}
