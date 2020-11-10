import { VoiceChannel, StreamOptions } from 'discord.js';
import fetch from 'node-fetch';
import { Readable } from 'stream';
import { AudioInfo } from './add.reaction';
import ytdl from 'ytdl-core-discord';

export const play = async (
    channel: VoiceChannel,
    audio: Readable | string,
    options?: StreamOptions
): Promise<void> => {
    return channel.join().then((connection) =>
        new Promise((resolve, reject) =>
            connection.play(audio, options)
                .on('start', () => {
                    connection.once('disconnect', () => {
                        resolve();
                    });
                })
                .on('finish', () => {
                    connection.disconnect();
                })
                .on('error', reject)
        ));
};

export const download = async (audio: AudioInfo): Promise<Readable> => audio.source === 'discord' ?
    await fetch(audio.url)
        .then((res) => res.body)
        .then((buffer) => Readable.from(buffer)) :
    await ytdl(audio.url);