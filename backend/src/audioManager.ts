import {
    AudioPlayerStatus,
    AudioResource, createAudioPlayer,
    createAudioResource, VoiceConnection
} from '@discordjs/voice';
import fs, { createReadStream } from 'fs';
import path from 'path';

const loadFiles = (): {
    id: string;
    audio: AudioResource;
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
                const audio = createAudioResource(createReadStream(filePathCountdown), {
                    inlineVolume: true
                });
                audio.volume?.setVolume(volume);
                sounds.push({
                    id: i.toString(),
                    audio: audio,
                    path: filePathCountdown
                });
            }
            if (fs.lstatSync(filePathRespawnCount).isFile()) {
                const audio = createAudioResource(createReadStream(filePathRespawnCount), {
                    inlineVolume: true
                });
                audio.volume?.setVolume(volume);
                sounds.push({
                    id: 'respawn-' + i,
                    audio: audio,
                    path: filePathRespawnCount
                });
            }
            if (fs.lstatSync(filePathStart).isFile()) {
                const audio = createAudioResource(createReadStream(filePathStart), {
                    inlineVolume: true
                });
                audio.volume?.setVolume(volume);
                sounds.push({
                    id: 'start',
                    audio: audio,
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


export class AudioManager {
    private sounds: {
        id: string;
        audio: AudioResource;
        path: string;
    }[] = loadFiles();

    public constructor(private player = createAudioPlayer()) {
        this.player.on(AudioPlayerStatus.Idle, () => {
            this.sounds.forEach((sound) => {
                if (sound.audio.ended) {
                    const audio = createAudioResource(createReadStream(sound.path), {
                        inlineVolume: true
                    });
                    audio.volume?.setVolume(volume);
                    sound.audio = audio;
                }
            });
        });
    }

    public setVolume(volume: number): void {
        this.sounds.forEach((sound) => {
            sound.audio.volume?.setVolume(volume);
        });
    }
    public playCountdown(timestamp: number): void {
        const sound = this.sounds.find((sound) => sound.id === timestamp.toString());
        const audio = sound?.audio;
        if (audio && !audio.ended) {
            this.player.play(audio);
        }
    }
    public playRespawnCount(count: number): void {
        const sound = this.sounds.find((sound) => sound.id === 'respawn-' + count);
        const audio = sound?.audio;
        if (audio && !audio.ended) {
            this.player.play(audio);
        }
    }
    public playStart(): void {
        const sound = this.sounds.find((sound) => sound.id === 'start');
        const audio = sound?.audio;
        if (audio && !audio.ended) {
            this.player.play(audio);
        }
    }
    public subscribe(connection: VoiceConnection): void {
        connection.subscribe(this.player);
    }
}
