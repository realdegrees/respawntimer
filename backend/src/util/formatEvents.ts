import { Client, Guild } from 'discord.js';
import { ScheduledEvent } from '../common/types/raidhelperEvent';
import { checkChannelPermissions } from './permissions';
import { DBGuild } from '../common/types/dbGuild';

const MAX_TITLE_LEN = 20;
const TITLE_CUT_FILL = '..';
export const formatEvents = (guild: Guild, ...events: ScheduledEvent[]): Promise<string[]> => {
	return Promise.all(
		events.map(async (event) => {
			// Truncate title over the length of 20, fill other titles with spaces to line up with truncated titles
			const title =
				event.title.length > MAX_TITLE_LEN
					? event.title.slice(0, MAX_TITLE_LEN - 1) + TITLE_CUT_FILL
					: event.title;
			const time = '🗓️ ' + `<t:${event.startTimeUnix}:d>` + ' 🕑 ' + `<t:${event.startTimeUnix}:t>`;
			const voiceChannel = event.voiceChannelId
				? await guild.channels.fetch(event.voiceChannelId).catch(() => undefined)
				: undefined;
			const voiceChannelPermissions = voiceChannel?.isVoiceBased()
				? await checkChannelPermissions(voiceChannel, ['ViewChannel', 'Connect', 'Speak'])
						.then(() => '')
						.catch((e) => `\n⚠️ ${e}`)
				: '';
			return `📝 ${title} ${time}${
				voiceChannel ? ` 🔗 ${voiceChannel} ${voiceChannelPermissions}` : ''
			}`;
		})
	);
};
export const formatEventsNoFetch = (dbGuild: DBGuild, ...events: ScheduledEvent[]): string[] => {
	return events.map((event) => {
		// Truncate title over the length of 20, fill other titles with spaces to line up with truncated titles
		const title =
			event.title.length > MAX_TITLE_LEN
				? event.title.slice(0, MAX_TITLE_LEN - 1) + TITLE_CUT_FILL
				: event.title;
		const time = '🗓️ ' + `<t:${event.startTimeUnix}:d>` + ' 🕑 ' + `<t:${event.startTimeUnix}:t>`;
		const voiceChannelId = event.voiceChannelId ?? dbGuild.raidHelper.defaultVoiceChannelId;
		return `📝 ${title} ${time}${voiceChannelId ? ` 🔗 <#${voiceChannelId}>` : ''}`;
	});
};
