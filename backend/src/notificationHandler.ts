import { Client, EmbedBuilder, Guild } from 'discord.js';
import { getGuild, queryGuilds } from './db/guild.schema';
import { setTimeout } from 'timers/promises';
import logger from '../lib/logger';
import { WARTIMER_ICON_LINK } from './common/constant';

const sourceServerId = '979269592360837120';
const sourceChannelId = '1151202146268741682';

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
    public static async sendNotification(guild: Guild, text: string): Promise<unknown> {
        return getGuild(guild).then((dbGuild) => dbGuild.notificationChannelId ?
            guild.channels.fetch(dbGuild.notificationChannelId)
                .then(async (channel) => {
                    if (!channel || !channel.isTextBased()) {
                        return Promise.reject();
                    } else {
                        return channel.send({
                            embeds: [
                                new EmbedBuilder()
                                    .setAuthor({ iconURL: WARTIMER_ICON_LINK, name: 'Wartimer Notification' })
                                    .setTitle('Local Server Notification')
                                    .setDescription(text)
                            ]
                        });
                    }
                })
                .catch((e) => {
                    logger.error(e);
                    dbGuild.notificationChannelId = undefined;
                    return dbGuild.save().then();
                }) : Promise.reject());
    }
}
