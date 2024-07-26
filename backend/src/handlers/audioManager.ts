import {
	AudioPlayer,
	AudioPlayerStatus,
	AudioResource,
	createAudioPlayer,
	createAudioResource,
	getVoiceConnection,
	joinVoiceChannel,
	NoSubscriberBehavior,
	VoiceConnection,
} from '@discordjs/voice';
import fs from 'fs';
import path from 'path';
import logger from '../../lib/logger';
import { VoiceBasedChannel } from 'discord.js';
import { Widget } from '../widget';
import { checkChannelPermissions } from '../util/permissions';
import { TimingsSettings } from '../common/settings/timings.settings';
import { WarInfo } from '../common/types';
import { IntervalManager, Subscriber, TimeInfo, UnsubscribeReason } from './intervalManager';

const loadVoice = (
	voice: Voices
): {
	[sound: string]: AudioResource;
} => {
	const sounds: {
		[sound: string]: AudioResource;
	} = {};
	const directoryPath = path.resolve(process.cwd(), 'audio', voice.toLowerCase());

	for (let i = -1; i < 60; i++) {
		const filePathCountdown = directoryPath + '/' + i + '.mp3';
		const filePathCountdownShifted = directoryPath + '/+' + i + '.mp3';
		const filePathRespawnCount = directoryPath + '/respawn-' + i + '.mp3';
		try {
			if (fs.lstatSync(filePathCountdown).isFile()) {
				sounds[i.toString()] = createAudioResource(filePathCountdown);
			}
		} catch (e) {
			/* empty */
		}
		try {
			if (fs.lstatSync(filePathCountdownShifted).isFile()) {
				sounds[i.toString()] = createAudioResource(filePathCountdownShifted);
			}
		} catch (e) {
			/* empty */
		}

		try {
			if (fs.lstatSync(filePathRespawnCount).isFile()) {
				sounds[i.toString()] = createAudioResource(filePathRespawnCount);
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
const defaultRespawnData = TimingsSettings.convertToRespawnData(
	TimingsSettings.convertToSeconds(TimingsSettings.DEFAULT)!
);

const audioResources: Partial<Record<Voices, Record<string, AudioResource>>> = {};
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
	audioResources[voice] = voiceFiles;
	logger.info(`[SERVER] Loaded voice ${voice} (${Object.keys(voiceFiles).length} Files)`);
});

type Extended = { voiceConnection?: VoiceConnection };
class AudioManager extends IntervalManager<Extended> {
	public constructor() {
		super({
			voiceConnection: (guildId) => getVoiceConnection(guildId)
		});
	}
	public update(subscribers: (Subscriber & Extended & TimeInfo)[]): void {
		subscribers.forEach(
			({ warEnd, dbGuild: { id, customTimings, voice, name }, voiceConnection }) => {
				if (warEnd || !voiceConnection) {
					this.unsubscribe(id, warEnd ? 'War End' : 'No Voiceconnection');
					return;
				}
				const audioPlayer = createAudioPlayer(defaultAudioPlayerBehaviour);
				const subscription = voiceConnection.subscribe(audioPlayer);
				audioPlayer.on(AudioPlayerStatus.Idle, () => {
					subscription?.unsubscribe();
				});

				const respawnData = customTimings
					? TimingsSettings.convertToRespawnData(TimingsSettings.convertToSeconds(customTimings)!)
					: defaultRespawnData;

				this.handleSounds(respawnData, voice, audioPlayer);
			}
		);
	}

	private handleSounds(data: WarInfo, voice: Voices, audioPlayer: AudioPlayer): void {
		// Audioplayer only plays at the second marks provided by available sound files
		// Skip any announcements higher than 50% of the total time
		if (
			data.respawn.timeUntilRespawn / data.respawn.duration < 0.5 &&
			data.respawn.remainingRespawns > 0
		) {
			this.playCountdown(data.respawn.timeUntilRespawn, voice, audioPlayer);
		}
		if (
			data.respawn.remainingRespawns <= 5 &&
			data.respawn.duration - data.respawn.timeUntilRespawn === 2
		) {
			this.playRespawnCount(data.respawn.remainingRespawns, voice, audioPlayer);
		}
		if (
			data.respawn.remainingRespawns === 0 &&
			data.respawn.previousTimestamp &&
			data.respawn.previousTimestamp - data.war.timeLeftSeconds === 5
		) {
			this.playRespawnCount(0, voice, audioPlayer);
		}
	}

	private playCountdown(num: number, voice: Voices, player: AudioPlayer): void {
		const voiceFiles = audioResources[voice];
		const audioResource = voiceFiles?.[num.toString()] ?? voiceFiles?.['+' + (num - 1).toString()];

		if (audioResource) player.play(audioResource);
	}
	private playRespawnCount(count: number, voice: Voices, player: AudioPlayer): void {
		const voiceFiles = audioResources[voice];
		const audioResource = voiceFiles?.['respawn-' + count];

		if (audioResource) player.play(audioResource);
	}

	public async subscribe(
		guildId: string,
		channel: VoiceBasedChannel,
		widget?: Widget
	): Promise<() => Promise<void>> {
		await this.connect(channel).then(() => {
			if (widget) {
				widget.voiceState = true;
				return widget.update({ force: true });
			}
		});
		return super.subscribe(guildId);
	}
	public unsubscribe(guildId: string, reason?: UnsubscribeReason): Promise<void> {
		getVoiceConnection(guildId)?.destroy();
		return super.unsubscribe(guildId, reason);
	}

	private async connect(channel: VoiceBasedChannel): Promise<VoiceConnection> {
		await checkChannelPermissions(channel, ['ViewChannel', 'Connect', 'Speak']);
		const connection = joinVoiceChannel({
			guildId: channel.guild.id,
			channelId: channel.id,
			adapterCreator: channel.guild.voiceAdapterCreator
		});
		return connection;
	}
}
export default new AudioManager();
