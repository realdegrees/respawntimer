import {
    AudioPlayer,
    createAudioPlayer,
    createAudioResource, getVoiceConnection, joinVoiceChannel, VoiceConnection, VoiceConnectionStatus
} from '@discordjs/voice';
import fs from 'fs';
import path from 'path';
import logger from '../../lib/logger';
import { timers } from '../common/timer';
import { Guild, VoiceBasedChannel } from 'discord.js';
import { Widget } from '../common/widget';
import { getGuild } from '../db/guild.schema';
import { checkChannelPermissions } from './checkChannelPermissions';
import { TimingsSettings } from '../common/settings/timings.settings';
import { DBGuild } from '../common/types/dbGuild';
import { WarInfo } from '../common/types';

const loadFiles = (voice: Voices): {
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
        } catch (e) { /* empty */ }
        try {

            if (fs.lstatSync(filePathCountdownShifted).isFile()) {
                sounds.push({
                    id: '+' + i.toString(),
                    path: filePathCountdownShifted
                });
            }
        } catch (e) { /* empty */ }

        try {
            if (fs.lstatSync(filePathRespawnCount).isFile()) {
                sounds.push({
                    id: 'respawn-' + i,
                    path: filePathRespawnCount
                });
            }
        } catch (e) { /* empty */ }
    }
    return sounds;
};

export type Voices = 'male' | 'female' | 'material' | 'rocket league';
type Subscriber = {
    timeStamp: number;
    guild: Guild;
    voice: Voices;
    connection: VoiceConnection;
    audioPlayer: AudioPlayer;
    timings?: number[];
};
// TODO: create a new audioplayer for every single subscriber that joins that has custom timings saved in the db and play aduio from that for the subscriber
class AudioManager {
    private subscribers: Subscriber[] = [];
    public voices: {
        voiceType: Voices;
        voiceDescription: string;
        files: {
            id: string;
            path: string;
        }[];
        player: AudioPlayer;
    }[] = [
            {
                voiceType: 'male',
                voiceDescription: 'A generic male voice',
                files: loadFiles('male'),
                player: createAudioPlayer()
            }, {
                voiceType: 'female',
                voiceDescription: 'A generic female voice',
                files: loadFiles('female'),
                player: createAudioPlayer()
            },
            {
                voiceType: 'material',
                voiceDescription: 'Sound effects from the material library',
                files: loadFiles('material'),
                player: createAudioPlayer()
            },
            {
                voiceType: 'rocket league',
                voiceDescription: 'Rocket League sound effects',
                files: loadFiles('rocket league'),
                player: createAudioPlayer()
            }
        ];

    public interval(): void {
        if (this.subscribers.length === 0) return;
        this.subscribers.forEach((subscriber) => {
            // Disconnect at war end if it's been on for more than 15 minutes
            const date = new Date();
            const [minutes, seconds] = [date.getMinutes(), date.getSeconds()];
            const minutesSubscribed = new Date(date.getTime() - subscriber.timeStamp).getTime() / 1000 / 60;

            if ((minutes === 59 || minutes === 29) && seconds === 59 && minutesSubscribed >= 15) {
                getGuild(subscriber.guild).then((dbGuild) => 
                    this.disconnect(subscriber.guild, dbGuild)
                ).catch(logger.error);
            }
        });

        const defaultRespawnData = TimingsSettings.convertToRespawnData(TimingsSettings.convertToSeconds(TimingsSettings.DEFAULT)!);
        const customSubscribers = this.subscribers.filter((s) => s.timings);

        // Play sounds for all subscribers with custom timings
        customSubscribers.forEach((subscriber) => {
            if (!subscriber.timings) return;
            const customRespawnData = TimingsSettings.convertToRespawnData(subscriber.timings);
            this.handleSounds(customRespawnData, subscriber.voice, subscriber.audioPlayer);
        });
        // Play sounds for all subscribers listening to default timings
        this.voices.forEach((voice) => this.handleSounds(defaultRespawnData, voice.voiceType, voice.player));
    }

    private handleSounds(data: WarInfo, voice: Voices, audioPlayer: AudioPlayer): void {
        // Audioplayer only plays at the second marks provided by available sound files
        // Skip any announcements higher than 50% of the total time 
        if (data.respawn.timeUntilRespawn / data.respawn.duration < 0.50 && data.respawn.remainingRespawns > 0) {
            this.playCountdown(data.respawn.timeUntilRespawn, voice, audioPlayer);
        }
        if (data.respawn.remainingRespawns <= 5 && data.respawn.duration - data.respawn.timeUntilRespawn === 2) {
            this.playRespawnCount(data.respawn.remainingRespawns, voice, audioPlayer);
        }
        if (data.respawn.remainingRespawns === 0 && 1800 - timers[timers.length - 1] - data.war.timeLeftSeconds === 5) {
            // Plays last respawn sound
            this.playRespawnCount(0, voice, audioPlayer);
        }
    }

    private playCountdown(num: number, voice: Voices, player?: AudioPlayer): void {
        const voiceData = this.voices.find((v) => v.voiceType === voice);
        const audioPlayer = player ?? voiceData?.player;
        const sound = voiceData?.files.find((file) => file.id === num.toString()) ??
            voiceData?.files.find((file) => file.id === '+' + (num - 1).toString());
        if (sound) {
            audioPlayer?.play(createAudioResource(sound.path));
        }
    }
    private playRespawnCount(count: number, voice: Voices, player?: AudioPlayer): void {
        const voiceData = this.voices.find((v) => v.voiceType === voice);
        const audioPlayer = player ?? voiceData?.player;
        const sound = voiceData?.files.find((file) => file.id === 'respawn-' + count);
        if (sound) {
            audioPlayer?.play(createAudioResource(sound.path));
        }
    }

    public setVoice(guildId: string, voice: Voices): void {
        const subscriber = this.subscribers.find((s) => s.guild.id === guildId);
        if (!subscriber) return;
        subscriber.voice = voice;
        // No need to change audioplayer susbcription because subscribers with custom timings have individual audioplayers they are already subscribed to
        if (subscriber.timings) return;
        subscriber.connection.subscribe(this.voices.find((sounds) => sounds.voiceType === voice)!.player);
    }

    public setTimings(guildId: string, timings: string): void {
        const subscriber = this.subscribers.find((s) => s.guild.id === guildId);
        if (!subscriber) return;
        const timingsList = TimingsSettings.convertToSeconds(timings);
        if (!timingsList) return this.resetTimings(guildId);
        subscriber.timings = timingsList;
    }
    public resetTimings(guildId: string): void {
        const subscriber = this.subscribers.find((s) => s.guild.id === guildId);
        if (!subscriber?.timings) return;
        subscriber.audioPlayer = this.voices.find((sounds) => sounds.voiceType === subscriber.voice)!.player;
        subscriber.connection.subscribe(subscriber.audioPlayer);
    }
    // eslint-disable-next-line max-len
    public subscribe(options: {
        connection: VoiceConnection;
        guild: Guild;
        voice?: Voices;
        customTimings?: string;
    }): void {
        const timings = TimingsSettings.convertToSeconds(options.customTimings ?? '');
        const audioPlayer = timings ? createAudioPlayer() : this.voices.find((sounds) => sounds.voiceType === options.voice)!.player;
        options.connection.subscribe(audioPlayer);
        this.subscribers.push({
            timeStamp: Date.now(),
            guild: options.guild,
            voice: options.voice ?? 'female',
            connection: options.connection,
            audioPlayer,
            timings
        });

        // ! TEMPORARY FIX FOR DISCORD API ISSUE https://github.com/discordjs/discord.js/issues/9185
        options.connection.on('stateChange', (oldState, newState) => {
            const oldNetworking = Reflect.get(oldState, 'networking');
            const newNetworking = Reflect.get(newState, 'networking');

            // eslint-disable-next-line max-len
            // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
            const networkStateChangeHandler = (oldNetworkState: any, newNetworkState: any) => {
                const newUdp = Reflect.get(newNetworkState, 'udp');
                clearInterval(newUdp?.keepAliveInterval);
            };

            oldNetworking?.off('stateChange', networkStateChangeHandler);
            newNetworking?.on('stateChange', networkStateChangeHandler);
        });
    }
    public disconnect(guild: Guild, dbGuild: DBGuild): void {
        Widget.get(guild, dbGuild.widget.messageId, dbGuild.widget.channelId).then((widget) => {
            widget?.onAudioUnsubscribe();
        }).finally(() => {
            this.subscribers.splice(this.subscribers.findIndex((s) => s.guild.id === guild.id), 1);
            getVoiceConnection(guild.id)?.destroy();
        }).catch(logger.error);
    }

    public isConnected(guildId: string): boolean {
        return !!this.subscribers.find((subscriber) => subscriber.guild.id === guildId);
    }

    public async connect(channel: VoiceBasedChannel, dbGuild: DBGuild): Promise<void> {
        if (this.subscribers.find((s) => s.guild.id === dbGuild.id)) return Promise.reject('Already connected');
        return this.getConnection(channel)
            .then((connection) => connection.on(VoiceConnectionStatus.Disconnected, () => {
                getGuild(channel.guild)
                    .then((dbGuild) => Widget.get(channel.guild, dbGuild.widget.messageId, dbGuild.widget.channelId))
                    .then((widget) => widget?.toggleVoice({dbGuild}))
                    .catch(() => { });
            }))
            .then((connection) =>
                this.subscribe({
                    connection,
                    guild: channel.guild,
                    voice: dbGuild.voice,
                    customTimings: dbGuild.customTimings
                })
            );
    }

    private getConnection(channel: VoiceBasedChannel): Promise<VoiceConnection> {
        return checkChannelPermissions(channel, ['ViewChannel', 'Connect', 'Speak'])
            .then(() => joinVoiceChannel({
                guildId: channel.guild.id,
                channelId: channel.id,
                adapterCreator: channel.guild.voiceAdapterCreator
            }))
            .then((connection) => {
                logger.info('[' + channel.guild.name + '] Connected to VoiceChannel');
                return connection;
            });
    }
}
export default new AudioManager();
