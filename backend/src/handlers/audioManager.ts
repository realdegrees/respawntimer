import {
	AudioPlayer,
	AudioPlayerStatus,
	AudioResource,
	createAudioPlayer,
	createAudioResource,
	DiscordGatewayAdapterCreator,
	getVoiceConnection,
	joinVoiceChannel,
	NoSubscriberBehavior,
	VoiceConnection,
	VoiceConnectionStatus
} from '@discordjs/voice';
import fs from 'fs';
import path from 'path';
import logger from '../../lib/logger';
import { VoiceBasedChannel } from 'discord.js';
import { Widget } from '../widget';
import { checkChannelPermissions } from '../util/permissions';
import { TimingsSettings } from '../common/settings/timings.settings';
import { WarInfo } from '../common/types';
import { Manager, Subscriber, TimeInfo, UnsubscribeReason } from './manager';
import Database from '../db/database';
import { WAR_START_INTERVAL } from '../common/constant';

//TODO: can probably remove this since the path can just be passed to createAudioResource without a crash
const loadVoice = (
	voice: Voices
): {
	id: string;
	path: string;
}[] => {
	const sounds = [];
	const directoryPath = path.resolve(process.cwd(), 'audio', voice.toLowerCase());

	for (let i = -1; i < 60; i++) {
		const filePathCountdown = directoryPath + '/' + i + '.mp3';
		const filePathCountdownShifted = directoryPath + '/+' + i + '.mp3';
		const filePathRespawnCount = directoryPath + '/respawn-' + i + '.mp3';
		try {
			if (fs.lstatSync(filePathCountdown).isFile()) {
				sounds.push({
					id: i.toString(),
					path: filePathCountdown
				});
			}
		} catch (e) {
			/* empty */
		}
		try {
			if (fs.lstatSync(filePathCountdownShifted).isFile()) {
				sounds.push({
					id: '+' + i.toString(),
					path: filePathCountdownShifted
				});
			}
		} catch (e) {
			/* empty */
		}

		try {
			if (fs.lstatSync(filePathRespawnCount).isFile()) {
				sounds.push({
					id: 'respawn-' + i,
					path: filePathRespawnCount
				});
			}
		} catch (e) {
			/* empty */
		}
	}
	return sounds;
};

const defaultAudioPlayerBehaviour = {
	behaviors: {
		noSubscriber: NoSubscriberBehavior.Stop
	}
};
const voiceMap: Partial<
	Record<
		Voices,
		{
			id: string;
			path: string;
		}[]
	>
> = {};
export type Voices = 'male' | 'female' | 'female legacy' | 'material' | 'rocket league';
export const voices: Record<Voices, string> = {
	female: 'A generic female voice',
	male: 'A generic male voice',
	'female legacy': 'The original female voice',
	material: 'Sound effects from the material library',
	'rocket league': 'Rocket League sound effects'
};

// Looks for voice files and loads them as an audio resource
(Object.keys(voices) as Voices[]).forEach((voice) => {
	const voiceFiles = loadVoice(voice);
	voiceMap[voice] = voiceFiles;
	logger.info(`[SERVER] Loaded voice ${voice} (${Object.keys(voiceFiles).length} Files)`);
});

type Extended = { voiceConnection?: VoiceConnection };
class AudioManager extends Manager<Extended> {
	private audioPlayers: Record<string, AudioPlayer> = {};
	public constructor() {
		super({
			voiceConnection: (guildId) => getVoiceConnection(guildId)
		});
	}
	public update(subscribers: (Subscriber & Extended & TimeInfo)[]): void {
		subscribers.forEach(
			({
				warEnd,
				dbGuild: { id, customTimings, voice },
				voiceConnection,
				time: { subscribedForMs }
			}) => {
				if (!voiceConnection) {
					this.unsubscribe(id, 'No Voiceconnection');
					return;
				}

				const minutesSubscribed = subscribedForMs / 1000 / 60;
				if (warEnd && minutesSubscribed >= WAR_START_INTERVAL / 2) {
					this.unsubscribe(id, 'War End');
					return;
				}

				const respawnData = customTimings
					? TimingsSettings.convertToRespawnData(TimingsSettings.convertToSeconds(customTimings)!)
					: TimingsSettings.convertToRespawnData(
							TimingsSettings.convertToSeconds(TimingsSettings.DEFAULT)!
						);

				this.handleSounds(respawnData, voice, voiceConnection);
			}
		);
	}

	private handleSounds(data: WarInfo, voice: Voices, voiceConnection: VoiceConnection): void {
		// Audioplayer only plays at the second marks provided by available sound files
		// Skip any announcements higher than 50% of the total time
		if (
			data.respawn.timeUntilRespawn / data.respawn.duration < 0.5 &&
			data.respawn.remainingRespawns > 0
		) {
			this.playCountdown(data.respawn.timeUntilRespawn, voice, voiceConnection);
		}
		if (
			data.respawn.remainingRespawns <= 5 &&
			data.respawn.duration - data.respawn.timeUntilRespawn === 2
		) {
			this.playRespawnCount(data.respawn.remainingRespawns, voice, voiceConnection);
		}
		if (
			data.respawn.remainingRespawns === 0 &&
			data.respawn.previousTimestamp &&
			data.respawn.previousTimestamp - data.war.timeLeftSeconds === 5
		) {
			this.playRespawnCount(0, voice, voiceConnection);
		}
	}

	private playCountdown(num: number, voice: Voices, voiceConnection: VoiceConnection): void {
		const voiceFiles = voiceMap[voice];
		const path =
			voiceFiles?.find(({ id }) => id === `+${num}`)?.path ??
			voiceFiles?.find(({ id }) => id === `${num}`)?.path;
		if (path) {
			const audioResource = createAudioResource(path);
			this.playAudio(audioResource, voiceConnection);
		}
	}
	private playRespawnCount(count: number, voice: Voices, voiceConnection: VoiceConnection): void {
		const voiceFiles = voiceMap[voice];
		const path = voiceFiles?.find(({ id }) => id === `respawn-${count}`)?.path;
		if (path) {
			const audioResource = createAudioResource(path);
			this.playAudio(audioResource, voiceConnection);
		}
	}
	private playAudio(audioResource: AudioResource, voiceConnection: VoiceConnection): void {
		const audioPlayer = this.audioPlayers[voiceConnection.joinConfig.guildId];
		const subscription = voiceConnection.subscribe(audioPlayer);
		audioPlayer.play(audioResource);
		// audioPlayer.on(AudioPlayerStatus.Idle, (v) => {
		// 	subscription?.unsubscribe();
		// });
	}

	public async subscribe(
		guildId: string,
		channel: VoiceBasedChannel
	): Promise<() => Promise<void>> {
		await this.connect(channel).then(async (voiceConnection) => {
			this.audioPlayers[guildId] = createAudioPlayer(defaultAudioPlayerBehaviour);
			voiceConnection.subscribe(this.audioPlayers[guildId]);
			const dbGuild = await Database.getGuild(guildId);
			const widget = await Widget.find(dbGuild);
			if (widget) {
				widget.voiceState = true;
				if (!widget.textState) widget.update({ force: true });
			}
		});
		return super.subscribe(guildId);
	}
	public async unsubscribe(guildId: string, reason?: UnsubscribeReason): Promise<void> {
		getVoiceConnection(guildId)?.destroy();
		this.audioPlayers[guildId].stop();
		delete this.audioPlayers[guildId];
		const dbGuild = await Database.getGuild(guildId);
		const widget = await Widget.find(dbGuild);
		if (widget) {
			widget.voiceState = false;
			if (!widget.textState) widget.update({ force: true });
		}
		return super.unsubscribe(guildId, reason);
	}

	private async connect(channel: VoiceBasedChannel): Promise<VoiceConnection> {
		await checkChannelPermissions(channel, ['ViewChannel', 'Connect', 'Speak']);
		const connection = joinVoiceChannel({
			guildId: channel.guild.id,
			channelId: channel.id,
			adapterCreator: channel.guild.voiceAdapterCreator as unknown as DiscordGatewayAdapterCreator
		});
		connection.on(VoiceConnectionStatus.Disconnected, () => connection.destroy());
		return connection;
	}
}
export default new AudioManager();
