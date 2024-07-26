import { AudioPlayerStatus, 
    AudioResource, createAudioPlayer, 
    createAudioResource, VoiceConnection } from '@discordjs/voice';
import fs from 'fs';
import path from 'path';

let isPlaying = false;
const volume = 0.7;

class AudioPlayer {
    private sounds: {
        id: string;
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
    public playCountdown(timestamp: number): void {
        const sound = this.sounds.find((sound) => sound.id === timestamp.toString());
        const audio = sound?.audio;
        if (audio && !isPlaying) {
            this.player.play(audio);
            // sound.audio = createAudioResource(sound.path);
        }
    }
    public playRespawnCount(count: number): void {
        const sound = this.sounds.find((sound) => sound.id === 'respawn-' + count);
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
    id: string;
    audio: AudioResource;
    path: string;
}[] => {
    const sounds = [];
    const directoryPath = path.resolve(process.cwd(), 'dist/audio');
    for (let i = -1; i < 60; i++) {
        const filePathCountdown = directoryPath + '/' + i + '.mp3';
        const filePathRespawnCount = directoryPath + '/respawn-' + i + '.mp3';
        try {
            if (fs.lstatSync(filePathCountdown).isFile()) {
                const audio = createAudioResource(filePathCountdown, {
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
                const audio = createAudioResource(filePathRespawnCount, {
                    inlineVolume: true
                });
                audio.volume?.setVolume(volume);
                sounds.push({
                    id: 'respawn-' + i,
                    audio: audio,
                    path: filePathRespawnCount
                });
            }
        } catch (e) {
            //Do nothing
        }
    }
    return sounds;
};
export default new AudioPlayer();