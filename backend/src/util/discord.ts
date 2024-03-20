import {
	DiscordAPIError,
	GuildBasedChannel,
	GuildTextBasedChannel,
	VoiceChannel
} from 'discord.js';
import { DBGuild } from '../common/types/dbGuild';
import { ScheduledEvent } from '../common/types/raidhelperEvent';
import Database from '../db/database';
import Bot from '../bot';
import logger from '../../lib/logger';

export const getEventVoiceChannel = async (
	event: ScheduledEvent,
	guildId: string
): Promise<GuildBasedChannel | null> => {
	const dbGuild = await Database.getGuild(guildId);
	const guild = await Bot.client.guilds.fetch(guildId);
	let voiceChannel: GuildBasedChannel | null = null;
	try {
		voiceChannel =
			(event.voiceChannelId
				? await guild.channels.fetch(event.voiceChannelId).catch(() => null)
				: null) ??
			(dbGuild.raidHelper.defaultVoiceChannelId
				? await guild.channels.fetch(dbGuild.raidHelper.defaultVoiceChannelId)
				: null);
	} catch (e) {
		// Unknown channel https://discord.com/developers/docs/topics/opcodes-and-status-codes
		if (e instanceof DiscordAPIError && e.code === 10003) {
			logger.info(`[${dbGuild.name}][10003] Unsetting default voice channel!`);
			dbGuild.raidHelper.defaultVoiceChannelId = undefined;
			await dbGuild.save();
		}
	}

	return voiceChannel;
};
export const getNotificationChannel = async (
	dbGuild: DBGuild
): Promise<GuildTextBasedChannel | null> => {
	const guild = await Bot.client.guilds.fetch(dbGuild.id);
	let channel: GuildBasedChannel | null = null;
	try {
		channel = dbGuild.notificationChannelId
			? await guild.channels.fetch(dbGuild.notificationChannelId).catch(() => null)
			: null;
	} catch (e) {
		// Unknown channel https://discord.com/developers/docs/topics/opcodes-and-status-codes
		if (e instanceof DiscordAPIError && e.code === 10003) {
			logger.info(`[${dbGuild.name}][10003] Unsetting notification channel!`);
			dbGuild.notificationChannelId = undefined;
			await dbGuild.save();
			return null;
		}
	}

	if (channel && !channel.isTextBased()) {
		logger.info(`[${dbGuild.name}] Unsetting notification channel! Not text-based!`);
		dbGuild.notificationChannelId = undefined;
		await dbGuild.save();
		return null;
	}

	return channel;
};
