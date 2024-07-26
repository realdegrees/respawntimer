import { Client, ColorResolvable, Colors, EmbedBuilder, Guild } from 'discord.js';
import { setTimeout } from 'timers/promises';
import logger from '../../lib/logger';
import { WARTIMER_ICON_LINK } from '../common/constant';
import Database from '../db/database';
import { DBGuild } from '../common/types/dbGuild';
import Bot from '../bot';
import { getNotificationChannel } from '../util/discord';

type NotificationResponse = {
	type: 'sent' | 'nochannel' | 'error' | 'duplicate';
	info?: string;
};

const DUPLICATE_PROTECTION_STRENGTH = 4; // How many previous notifications should be checked for duplicates
const notificationMap: {
	guildId: string;
	notifications: string[];
}[] = [];
export const UPDATE_SOURCE_SERVER_ID = '979269592360837120'; // Wartimer Development Server
export const UPDATE_SOURCE_CHANNEL_ID = '1151202146268741682'; // Wartimer Development Server Update Channel

export class NotificationHandler {
	public static async startListening(): Promise<void> {
		//! Disabled until the message content privilige is granted by discord or a web-based solution is implemented
		// const sourceChannel = await client.guilds.fetch(UPDATE_SOURCE_SERVER_ID)
		//     .then((guild) => guild.channels.fetch(UPDATE_SOURCE_CHANNEL_ID))
		//     .catch(() => undefined);
		// if(!sourceChannel) return Promise.reject('Unable to find update source channel at ' + `Server ID: ${UPDATE_SOURCE_SERVER_ID} Channel ID: ${UPDATE_SOURCE_CHANNEL_ID}`);
		// if(!sourceChannel.isTextBased()) return Promise.reject('Update source channel is not a text channel!');
		// sourceChannel.createMessageCollector().on('collect', (message) => {
		//     message.fetch().then(async (message) => {
		//         if(message.embeds.length === 0){
		//             logger.info('Collected message from update channel with no embeds!');
		//             return;
		//         }
		//         const dbGuilds = await Database.queryGuilds({
		//             'notificationChannelId': { $regex: /\d+/ }
		//         });
		//         for (const dbGuild of dbGuilds) {
		//             await client.guilds.fetch(dbGuild.id)
		//                 .then((guild) => dbGuild.notificationChannelId ? guild.channels.fetch(dbGuild.notificationChannelId) : undefined)
		//                 .catch(() => undefined)
		//                 .then(async (channel) => {
		//                     if (!channel || !channel.isTextBased()) {
		//                         dbGuild.notificationChannelId = undefined;
		//                         return dbGuild.save();
		//                     } else {
		//                         return channel.send({
		//                             embeds: message.embeds.map((embed) => EmbedBuilder.from(embed).setTimestamp())
		//                         });
		//                     }
		//                 })
		//                 .then(() => {
		//                     logger.info(`[${dbGuild.name}] Received Update`)
		//                 })
		//                 .then(() => setTimeout(2000))
		//                 .catch(logger.error);
		//         }
		//     }).catch(() => logger.error('Unable to fetch dev update message!'));
		// })
	}
	public static async sendNotification(
		dbGuild: DBGuild,
		title: string,
		text: string,
		options?: {
			color?: ColorResolvable;
			byPassDuplicateCheck?: boolean;
		}
	): Promise<NotificationResponse> {
		let guildNotificationMap = notificationMap.find(({guildId}) => guildId === dbGuild.id);

		if (!guildNotificationMap) {
			guildNotificationMap = {
				guildId: dbGuild.id,
				notifications: []
			};
			notificationMap.push(guildNotificationMap);
		}

		if (
			!options?.byPassDuplicateCheck &&
			guildNotificationMap.notifications.includes([title, text].join())
		) {
			return {
				type: 'duplicate'
			};
		}

		const channel = await getNotificationChannel(dbGuild);

		if (channel) {
			try {
				const message = await channel.send({
					embeds: [
						new EmbedBuilder()
							.setAuthor({
								iconURL: WARTIMER_ICON_LINK,
								name: 'Respawn Timer Notification'
							})
							.setTitle(title)
							.setDescription(text)
							.setColor(options?.color ?? Colors.Red)
							.setTimestamp()
					]
				});

				logger.info('[' + dbGuild.name + '][Notification] ' + title);
				saveToLog(guildNotificationMap, dbGuild.id, title, text);
				return {
					type: 'sent'
				};
			} catch (e) {
				return {
					type: 'error',
					info: String(e)
				};
			}
		} else {
			logger.debug('[' + dbGuild.name + '] Notification (log): ' + title);
			saveToLog(guildNotificationMap, dbGuild.id, title, text);
			return { type: 'nochannel' };
		}
	}
}

const saveToLog = (
	guildNotificationMap: typeof notificationMap extends (infer U)[] ? U : never,
	guildId: string,
	title: string,
	text: string
) => {
	if (!guildNotificationMap.notifications.includes([title, text].join())) {
		guildNotificationMap.notifications.push([title, text].join());
		if (guildNotificationMap.notifications.length >= DUPLICATE_PROTECTION_STRENGTH) {
			guildNotificationMap.notifications.reverse().pop();
			guildNotificationMap.notifications.reverse();
		}
	}
};
