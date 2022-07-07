import { AudioPlayerStatus, 
    AudioResource, createAudioPlayer, 
    createAudioResource, VoiceConnection } from '@discordjs/voice';
import fs from 'fs';
import path from 'path';

let isPlaying = false;
const volume = 0.7;

class AudioPlayer {
    private sounds: {
        timestamp: number;
        audio: AudioResource;
        path: string;
    }[] = [];
    public constructor(private player = createAudioPlayer()) {
        this.sounds = [...loadFiles()];
        this.player.on(AudioPlayerStatus.Playing, () => {
            isPlaying = true;
        });
        this.player.on(AudioPlayerStatus.Idle, () => {
            isPlaying = false;
            this.sounds.forEach((sound) => {
                const audio = createAudioResource(sound.path, {
                    inlineVolume: true
                });
                audio.volume?.setVolume(volume);
                if(sound.audio.ended) sound.audio = audio;
            });
            // this.sounds = [...loadFiles()];
        });
    }
    public play(timestamp: number): void {
        const sound = this.sounds.find((sound) => sound.timestamp === timestamp);
        const audio = sound?.audio;
        if (audio && !isPlaying) {
            this.player.play(audio);
            // sound.audio = createAudioResource(sound.path);
        }
    }
    public subscribe(connection: VoiceConnection): void {
        connection.subscribe(this.player);
    }
}
const loadFiles = (): {
    timestamp: number;
    audio: AudioResource;
    path: string;
}[] => {
    const sounds = [];
    const directoryPath = path.resolve(process.cwd(), 'dist/audio');
    for (let i = 0; i < 60; i++) {
        const filePath = directoryPath + '/' + i + '.mp3';
        try {
            if (fs.lstatSync(filePath).isFile()) {
                const audio = createAudioResource(filePath, {
                    inlineVolume: true
                });
                audio.volume?.setVolume(volume);
                sounds.push({
                    timestamp: i,
                    audio: audio,
                    path: filePath
                });
            }
        } catch (e) {
            //Do nothing
        }
    }
    return sounds;
};
export default new AudioPlayer();