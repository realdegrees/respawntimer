import {
    AudioPlayer,
    createAudioPlayer,
    createAudioResource, getVoiceConnection, joinVoiceChannel, NoSubscriberBehavior, VoiceConnection, VoiceConnectionStatus
} from '@discordjs/voice';
import fs from 'fs';
import path from 'path';
import logger from '../../lib/logger';
import { Guild, VoiceBasedChannel } from 'discord.js';
import { Widget } from '../widget';
import { checkChannelPermissions } from '../util/permissions';
import { TimingsSettings } from '../common/settings/timings.settings';
import { DBGuild } from '../common/types/dbGuild';
import { WarInfo } from '../common/types';
import Database from '../db/database';
import Bot from '../bot';

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
const defaultAudioPlayerBehaviour = {
    behaviors: {
        noSubscriber: NoSubscriberBehavior.Stop
    }
};
export type Voices = 'male' | 'female' | 'female legacy' | 'material' | 'rocket league';
type Subscriber = {
    timeStamp: number;
    dbGuild: DBGuild;
    voice: Voices;
    connection: VoiceConnection;
    audioPlayer: AudioPlayer;
    timings?: number[];
};
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
                player: createAudioPlayer(defaultAudioPlayerBehaviour)
            }, {
                voiceType: 'female',
                voiceDescription: 'A generic female voice',
                files: loadFiles('female'),
                player: createAudioPlayer(defaultAudioPlayerBehaviour)
            }, {
                voiceType: 'female legacy',
                voiceDescription: 'The original female voice',
                files: loadFiles('female legacy'),
                player: createAudioPlayer(defaultAudioPlayerBehaviour)
            },
            {
                voiceType: 'material',
                voiceDescription: 'Sound effects from the material library',
                files: loadFiles('material'),
                player: createAudioPlayer(defaultAudioPlayerBehaviour)
            },
            {
                voiceType: 'rocket league',
                voiceDescription: 'Rocket League sound effects',
                files: loadFiles('rocket league'),
                player: createAudioPlayer(defaultAudioPlayerBehaviour)
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
                logger.info(`[${subscriber.dbGuild.name}] auto-disconnect voice`);
                Database.getGuild(subscriber.dbGuild.id).then((dbGuild) =>
                    this.disconnect(dbGuild)
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
        if (data.respawn.remainingRespawns === 0 && data.respawn.previousTimestamp && data.respawn.previousTimestamp - data.war.timeLeftSeconds === 5) {
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
        const subscriber = this.subscribers.find((s) => s.dbGuild.id === guildId);
        if (!subscriber) return;
        subscriber.voice = voice;
        // No need to change audioplayer susbcription because subscribers with custom timings have individual audioplayers they are already subscribed to
        if (subscriber.timings) return;
        subscriber.connection.subscribe(this.voices.find((sounds) => sounds.voiceType === voice)!.player);
    }

    public setTimings(guildId: string, timings: string): void {
        const subscriber = this.subscribers.find((s) => s.dbGuild.id === guildId);
        if (!subscriber) return;
        const timingsList = TimingsSettings.convertToSeconds(timings);
        if (!timingsList) return this.resetTimings(guildId);
        subscriber.timings = timingsList;
    }
    public resetTimings(guildId: string): void {
        const subscriber = this.subscribers.find((s) => s.dbGuild.id === guildId);
        if (!subscriber?.timings) return;
        subscriber.audioPlayer = this.voices.find((sounds) => sounds.voiceType === subscriber.voice)!.player;
        subscriber.connection.subscribe(subscriber.audioPlayer);
    }
    // eslint-disable-next-line max-len
    public subscribe(
        connection: VoiceConnection,
        dbGuild: DBGuild
    ): void {
        const timings = TimingsSettings.convertToSeconds(dbGuild.customTimings ?? '');
        const audioPlayer = timings ? createAudioPlayer(defaultAudioPlayerBehaviour) : this.voices.find((sounds) => sounds.voiceType === dbGuild.voice)!.player;
        connection.subscribe(audioPlayer);
        connection.setMaxListeners(100);
        this.subscribers.push({
            timeStamp: Date.now(),
            dbGuild,
            voice: dbGuild.voice ?? 'female',
            connection: connection,
            audioPlayer,
            timings
        });
    }
    public async disconnect(dbGuild: DBGuild): Promise<void> {
        
        return Widget.find(dbGuild).then((widget) => {
            widget?.onAudioUnsubscribe();
        }).finally(() => {
            this.subscribers.splice(this.subscribers.findIndex((s) => s.dbGuild.id === dbGuild.id), 1);
            getVoiceConnection(dbGuild.id)?.destroy();
        }).catch(logger.error);
    }

    public isConnected(dbGuild: DBGuild): boolean {
        const subscriber = this.subscribers.find((subscriber) => subscriber.dbGuild.id === dbGuild.id)
        const connection = getVoiceConnection(dbGuild.id)
        if (!subscriber && !!connection) {
            this.subscribe(connection, dbGuild);
            return true;
        } else {
            return !!subscriber;
        }
    }

    public async connect(channel: VoiceBasedChannel, dbGuild: DBGuild): Promise<void> {
        if (this.subscribers.find((s) => s.dbGuild.id === dbGuild.id)) return Promise.resolve();
        return this.getConnection(channel)
            .then((connection) => {
                this.subscribe(
                    connection,
                    dbGuild
                );
                return new Promise((res) =>
                    connection
                        .on(VoiceConnectionStatus.Disconnected, () => {
                            Widget.find(dbGuild)
                                .then((widget) => widget?.toggleVoice({ dbGuild }))
                                .catch(() => { });
                            logger.info(`[${dbGuild.name}] disconnected from voice channel`);
                        })
                        .on(VoiceConnectionStatus.Ready, () => {
                            logger.info(`[${dbGuild.name}] connected to voice channel`);
                            res();
                        })
                )
            })
    }

    private async getConnection(channel: VoiceBasedChannel): Promise<VoiceConnection> {
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
