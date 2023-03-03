import {
    AudioPlayerStatus,
    AudioResource, createAudioPlayer,
    createAudioResource, PlayerSubscription, VoiceConnection
} from '@discordjs/voice';
import fs, { createReadStream } from 'fs';
import path from 'path';
import { setTimeout } from 'timers/promises';
import logger from '../lib/logger';

const loadFiles = (): {
    id: string;
    path: string;
}[] => {
    const sounds = [];
    const directoryPath = path.resolve(process.cwd(), 'audio');
    for (let i = -1; i < 60; i++) {
        const filePathCountdown = directoryPath + '/' + i + '.mp3';
        const filePathRespawnCount = directoryPath + '/respawn-' + i + '.mp3';
        const filePathStart = directoryPath + '/start.mp3';
        try {
            if (fs.lstatSync(filePathCountdown).isFile()) {
                sounds.push({
                    id: i.toString(),
                    path: filePathCountdown
                });
            }
            if (fs.lstatSync(filePathRespawnCount).isFile()) {
                sounds.push({
                    id: 'respawn-' + i,
                    path: filePathRespawnCount
                });
            }
            if (fs.lstatSync(filePathStart).isFile()) {

                sounds.push({
                    id: 'start',
                    path: filePathStart
                });
            }
        } catch (e) {
            //Do nothing
        }
    }
    return sounds;
};

const volume = 0.7;
const subscribers: {
    guildId: string;
    connection: VoiceConnection;
    subscription?: PlayerSubscription;
}[] = [];
const sounds = loadFiles();

class AudioManager {
    public constructor(private player = createAudioPlayer()) { }

    public playCountdown(timestamp: number): void {
        const sound = sounds.find((sound) => sound.id === timestamp.toString());
        if (sound) {
            this.player.play(createAudioResource(createReadStream(sound.path)));
        }
    }
    public playRespawnCount(count: number): void {
        const sound = sounds.find((sound) => sound.id === 'respawn-' + count);
        if (sound) {
            this.player.play(createAudioResource(createReadStream(sound.path)));
        }
    }
    public playStart(): void {
        const sound = sounds.find((sound) => sound.id === 'start');
        if (sound) {
            this.player.play(createAudioResource(createReadStream(sound.path)));
        }
    }
    public subscribe(connection: VoiceConnection, guildId: string): void {
        subscribers.push({
            guildId,
            connection,
            subscription: connection.subscribe(this.player)
        });

        // ! TEMPORARY FIX FOR DISCORD API ISSUE https://github.com/discordjs/discord.js/issues/9185
        connection.on('stateChange', (oldState, newState) => {
            const oldNetworking = Reflect.get(oldState, 'networking');
            const newNetworking = Reflect.get(newState, 'networking');

            // eslint-disable-next-line max-len
            // eslint-disable-next-line @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-explicit-any
            const networkStateChangeHandler = (oldNetworkState: any, newNetworkState: any) => {
                const newUdp = Reflect.get(newNetworkState, 'udp');
                clearInterval(newUdp?.keepAliveInterval);
            };

            oldNetworking?.off('stateChange', networkStateChangeHandler);
            newNetworking?.on('stateChange', networkStateChangeHandler);
        });
    }
    public unsubscribe(guildId: string): void {
        const subscriber = subscribers.find((s) => s.guildId === guildId);
        subscriber?.subscription?.unsubscribe();
        subscribers.splice(subscribers.findIndex((s) => s.guildId === guildId), 1);
    }
}
export default new AudioManager();
