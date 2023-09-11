import {
    createAudioPlayer,
    createAudioResource, getVoiceConnection, PlayerSubscription, VoiceConnection
} from '@discordjs/voice';
import fs, { createReadStream } from 'fs';
import path from 'path';
import logger from '../../lib/logger';
import { timers } from '../common/timer';
import { Voices, WarInfo } from '../common/types';

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
    logger.debug(JSON.stringify(sounds));
    return sounds;
};

const subscribers: {
    timeStamp: number;
    guildId: string;
    connection: VoiceConnection;
    onUnsubscribe: () => void;
    subscription?: PlayerSubscription;
}[] = [];
const sounds = [
    {
        voice: 'male',
        files: loadFiles('male'),
        player: createAudioPlayer()
    }, {
        voice: 'female',
        files: loadFiles('female'),
        player: createAudioPlayer()
    }
];

class AudioManager {
    public constructor() { }

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
        sounds.forEach((sounds) => {
            const sound = sounds.files.find((sound) => sound.id === timestamp.toString()) ??
                sounds.files.find((sound) => sound.id === '+' + (timestamp - 1).toString());
            if (sound) {
                sounds.player.play(createAudioResource(createReadStream(sound.path)));
            }
        });
    }
    private playRespawnCount(count: number): void {
        sounds.forEach((sounds) => {
            const sound = sounds.files.find((sound) => sound.id === 'respawn-' + count);
            if (sound) {
                sounds.player.play(createAudioResource(createReadStream(sound.path)));
            }
        });
    }
    private playStart(): void {
        sounds.forEach((sounds) => {
            const sound = sounds.files.find((sound) => sound.id === 'start');
            if (sound) {
                sounds.player.play(createAudioResource(createReadStream(sound.path)));
            }
        });
    }
    // eslint-disable-next-line max-len
    public subscribe(connection: VoiceConnection, guildId: string, voice: Voices | undefined, onUnsubscribe: () => void): void {
        if(!voice){
            voice = 'female';
        }
        subscribers.push({
            timeStamp: Date.now(),
            guildId,
            connection,
            onUnsubscribe,
            subscription: connection.subscribe(sounds.find((sounds) => sounds.voice === voice)!.player)
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
