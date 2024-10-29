import {
	DiscordAPIError,
	GuildBasedChannel,
	GuildTextBasedChannel,
	VoiceChannel
} from 'discord.js';
import { DBGuild } from '../common/types/dbGuild';
import { ScheduledEvent } from '../common/types/raidhelperEvent';
import Bot from '../bot';
import logger from '../../lib/logger';

export const getEventVoiceChannel = async (
	event: ScheduledEvent,
	dbGuild: DBGuild
): Promise<GuildBasedChannel | null> => {
	const guild = await Bot.client.guilds.fetch(dbGuild.id).catch(() => undefined);
	let voiceChannel: GuildBasedChannel | null | undefined = null;
	try {
		voiceChannel =
			(event.voiceChannelId
				? await guild?.channels.fetch(event.voiceChannelId)
				: null) ??
			(dbGuild.raidHelper.defaultVoiceChannelId
				? await guild?.channels.fetch(dbGuild.raidHelper.defaultVoiceChannelId)
				: null);
	} catch (e) {
		// Unknown channel https://discord.com/developers/docs/topics/opcodes-and-status-codes
		if (e instanceof DiscordAPIError && e.code === 10003) {
			logger.info(`[${dbGuild.name}][10003] Unsetting default voice channel!`);
			dbGuild.raidHelper.defaultVoiceChannelId = undefined;
			await dbGuild.save();
		}
	}

	return voiceChannel ?? null;
};
export const getNotificationChannel = async (
	dbGuild: DBGuild
): Promise<GuildTextBasedChannel | null> => {
	const guild = await Bot.client.guilds.fetch(dbGuild.id).catch(() => undefined);
	let channel: GuildBasedChannel | null | undefined = null;
	try {
		channel = dbGuild.notificationChannelId
			? await guild?.channels.fetch(dbGuild.notificationChannelId)
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

	return channel ?? null;
};
