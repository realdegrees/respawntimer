import {
    AudioPlayer,
    createAudioPlayer,
    createAudioResource, getVoiceConnection, joinVoiceChannel, PlayerSubscription, VoiceConnection, VoiceConnectionStatus
} from '@discordjs/voice';
import fs from 'fs';
import path from 'path';
import logger from '../../lib/logger';
import { timers } from '../common/timer';
import { WarInfo } from '../common/types';
import { VoiceBasedChannel } from 'discord.js';
import { Widget } from '../common/widget';
import { getGuild } from '../db/guild.schema';
import { checkChannelPermissions } from './checkChannelPermissions';

const loadFiles = (voice: Voices): {
    id: string;
    path: string;
}[] => {
    const sounds = [];
    const directoryPath = path.resolve(process.cwd(), 'audio', voice.toLowerCase());

    const filePathStart = directoryPath + '/start.mp3';

    try {
        if (fs.lstatSync(filePathStart).isFile()) {

            sounds.push({
                id: 'start',
                path: filePathStart
            });
        }
    } catch (e) { /* empty */ }

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

// TODO: create a new audioplayer for every single subscriber that joins that has custom timings saved in the db and play aduio from that for the subscriber
class AudioManager {
    private subscribers: {
        timeStamp: number;
        guildId: string;
        connection: VoiceConnection;
        onUnsubscribe: () => void;
        subscription?: PlayerSubscription;
    }[] = [];
    public sounds: {
        voice: Voices;
        voiceDescription: string;
        files: {
            id: string;
            path: string;
        }[];
        player: AudioPlayer;
    }[] = [
            {
                voice: 'male',
                voiceDescription: 'A generic male voice',
                files: loadFiles('male'),
                player: createAudioPlayer()
            }, {
                voice: 'female',
                voiceDescription: 'A generic female voice',
                files: loadFiles('female'),
                player: createAudioPlayer()
            },
            {
                voice: 'material',
                voiceDescription: 'Sound effects from the material library',
                files: loadFiles('material'),
                player: createAudioPlayer()
            },
            {
                voice: 'rocket league',
                voiceDescription: 'Rocket League sound effects',
                files: loadFiles('rocket league'),
                player: createAudioPlayer()
            }
        ];
    public constructor() {
    }

    public interval(info: WarInfo): void {

        this.subscribers.forEach((subscriber) => {
            // Toggle widget & voice off at war end if it's been on for more than 15 minutes
            if (info.war.timeLeftSeconds === 5) {
                const minutesSubscribed = new Date(Date.now() - subscriber.timeStamp).getTime() / 1000 / 60;
                if (minutesSubscribed >= 15) {
                    this.disconnect(subscriber.guildId);
                }
            }
        });

        if (info.war.timeLeftSeconds === 1800 - 2) {
            this.playStart();
        }

        // Audioplayer only plays at the second marks provided by available sound files
        // Skip any announcements higher than 50% of the total time 
        if (info.respawn.timeUntilRespawn / info.respawn.duration < 0.50 && info.respawn.remaining > 0) {
            this.playCountdown(info.respawn.timeUntilRespawn);
        }
        if (info.respawn.remaining <= 5 && info.respawn.duration - info.respawn.timeUntilRespawn === 2) {
            this.playRespawnCount(info.respawn.remaining);
        }
        if (info.respawn.remaining === 0 && 1800 - timers[timers.length - 1] - info.war.timeLeftSeconds === 5) {
            // Plays last respawn sound
            this.playRespawnCount(0);
        }
    }

    private playCountdown(timestamp: number): void {
        this.sounds.forEach((sounds) => {
            const sound = sounds.files.find((sound) => sound.id === timestamp.toString()) ??
                sounds.files.find((sound) => sound.id === '+' + (timestamp - 1).toString());
            if (sound) {
                sounds.player.play(createAudioResource(sound.path));
            }
        });
    }
    private playRespawnCount(count: number): void {
        this.sounds.forEach((sounds) => {
            const sound = sounds.files.find((sound) => sound.id === 'respawn-' + count);
            if (sound) {
                sounds.player.play(createAudioResource(sound.path));
            }
        });
    }
    private playStart(): void {
        this.sounds.forEach((sounds) => {
            const sound = sounds.files.find((sound) => sound.id === 'start');
            if (sound) {
                sounds.player.play(createAudioResource(sound.path));
            }
        });
    }
    public setVoice(guildId: string, voice: Voices): void {
        const subscriber = this.subscribers.find((s) => s.guildId === guildId);
        subscriber?.connection.subscribe(this.sounds.find((sounds) => sounds.voice === voice)!.player);
    }
    // eslint-disable-next-line max-len
    public subscribe(connection: VoiceConnection, guildId: string, voice: Voices | undefined, onUnsubscribe: () => void): void {
        if (!voice) {
            voice = 'female';
        }
        this.subscribers.push({
            timeStamp: Date.now(),
            guildId,
            connection,
            onUnsubscribe,
            subscription: connection.subscribe(this.sounds.find((sounds) => sounds.voice === voice)!.player)
        });

        // ! TEMPORARY FIX FOR DISCORD API ISSUE https://github.com/discordjs/discord.js/issues/9185
        connection.on('stateChange', (oldState, newState) => {
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
    public disconnect(guildId: string): void {
        const subscriber = this.subscribers.find((s) => s.guildId === guildId);
        subscriber?.onUnsubscribe();
        subscriber?.subscription?.unsubscribe();
        this.subscribers.splice(this.subscribers.findIndex((s) => s.guildId === guildId), 1);
        getVoiceConnection(guildId)?.destroy();
    }

    public async connect(channel: VoiceBasedChannel, onUnsubscribe: () => Promise<unknown>, voice?: Voices): Promise<void> {
        return this.getConnection(channel)
            .then((connection) => connection.on(VoiceConnectionStatus.Disconnected, () => {
                getGuild(channel.guild)
                    .then((dbGuild) => Widget.get(channel.guild, dbGuild.widget.messageId, dbGuild.widget.channelId))
                    .then((widget) => widget.toggleVoice())
                    .catch(() => logger.debug('Bot was disconnected but couldnt find a widget to toggle'));
            }))
            .then((connection) => this.subscribe(
                connection,
                channel.guild.id,
                voice,
                onUnsubscribe
            ));
    }

    private getConnection(channel: VoiceBasedChannel): Promise<VoiceConnection> {
        return checkChannelPermissions(channel, ['ViewChannel', 'Connect', 'Speak'])
            .then(() => joinVoiceChannel({
                guildId: channel.guild.id,
                channelId: channel.id,
                adapterCreator: channel.guild.voiceAdapterCreator
            }));
    }
}
export default new AudioManager();
