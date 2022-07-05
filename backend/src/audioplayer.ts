import { AudioPlayerStatus, 
    AudioResource, createAudioPlayer, 
    createAudioResource, VoiceConnection } from '@discordjs/voice';
import fs from 'fs';
import path from 'path';
import logger from '../lib/logger';

let isPlaying = false;

class AudioPlayer {
    private sounds: {
        timestamp: number;
        audio: AudioResource;
    }[] = [];
    public constructor(private player = createAudioPlayer()) {
        this.sounds = [...loadFiles()];
        this.player.on(AudioPlayerStatus.Playing, () => {
            logger.log('Playing audio');
            isPlaying = true;
        });
        this.player.on(AudioPlayerStatus.Idle, () => {
            logger.log('Audio Idle');
            isPlaying = false;
            this.sounds = [...loadFiles()];

        });
    }
    public play(timestamp: number): void {
        const audio = this.sounds.find((sound) => sound.timestamp === timestamp)?.audio;
        if (audio && !isPlaying) {
            this.player.play(audio);
        }
    }
    public subscribe(connection: VoiceConnection): void {
        connection.subscribe(this.player);
    }
}
const loadFiles = (): {
    timestamp: number;
    audio: AudioResource;
}[] => {
    const sounds = [];
    const directoryPath = path.resolve(process.cwd(), 'dist/audio');
    logger.log('loading files');
    for (let i = 0; i < 60; i++) {
        const filePath = directoryPath + '/' + i + '.mp3';
        try {
            if (fs.lstatSync(filePath).isFile()) {
                sounds.push({
                    timestamp: i,
                    audio: createAudioResource(filePath)
                });
            }
        } catch (e) {
            //Do nothing
        }
    }
    return sounds;
};
export default new AudioPlayer();