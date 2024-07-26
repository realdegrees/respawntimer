import {
    createAudioPlayer,
    createAudioResource, getVoiceConnection, PlayerSubscription, VoiceConnection
} from '@discordjs/voice';
import fs, { createReadStream } from 'fs';
import path from 'path';
import { timers } from './common/timer';
import { WarInfo } from './common/types';

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

const subscribers: {
    timeStamp: number;
    guildId: string;
    connection: VoiceConnection;
    onUnsubscribe: () => void;
    subscription?: PlayerSubscription;
}[] = [];
const sounds = loadFiles();

class AudioManager {
    public constructor(private player = createAudioPlayer()) {     }

    public interval(info: WarInfo): void {

        subscribers.forEach((subscriber) => {
            // Toggle widget & voice off at war end if it's been on for more than 15 minutes
            if (info.war.timeLeftSeconds === 5) {
                const minutesSubscribed = new Date(Date.now() - subscriber.timeStamp).getMinutes();
                if (minutesSubscribed >= 15) {
                    this.unsubscribe(subscriber.guildId);
                }
            }
        });


        if (info.war.timeLeftSeconds === 1800 - 2) {
            this.playStart();
        }

        // Audioplayer only plays at the second marks provided by available sound files
        // Skip any announcements higher than 50% of the total time 
        if (info.respawn.timePassed / info.respawn.duration < 0.50 && info.respawn.remaining > 0) {
            this.playCountdown(info.respawn.timePassed);
        }
        if (info.respawn.remaining <= 5 && info.respawn.duration - info.respawn.timePassed === 2) {
            this.playRespawnCount(info.respawn.remaining);
        }
        if (info.respawn.remaining === 0 && 1800 - timers[timers.length - 1] - info.war.timeLeftSeconds === 5) {
            // Plays last respawn sound
            this.playRespawnCount(0);
        }
    }

    private playCountdown(timestamp: number): void {
        const sound = sounds.find((sound) => sound.id === timestamp.toString());
        if (sound) {
            this.player.play(createAudioResource(createReadStream(sound.path)));
        }
    }
    private playRespawnCount(count: number): void {
        const sound = sounds.find((sound) => sound.id === 'respawn-' + count);
        if (sound) {
            this.player.play(createAudioResource(createReadStream(sound.path)));
        }
    }
    private playStart(): void {
        const sound = sounds.find((sound) => sound.id === 'start');
        if (sound) {
            this.player.play(createAudioResource(createReadStream(sound.path)));
        }
    }
    public subscribe(connection: VoiceConnection, guildId: string, onUnsubscribe: () => void): void {
        subscribers.push({
            timeStamp: Date.now(),
            guildId,
            connection,
            onUnsubscribe,
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
        subscriber?.onUnsubscribe();
        subscriber?.subscription?.unsubscribe();
        subscribers.splice(subscribers.findIndex((s) => s.guildId === guildId), 1);
        getVoiceConnection(guildId)?.disconnect();
        getVoiceConnection(guildId)?.destroy();
    }
}
export default new AudioManager();
