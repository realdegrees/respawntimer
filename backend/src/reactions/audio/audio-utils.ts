import { VoiceChannel, StreamOptions } from 'discord.js';
import fetch from 'node-fetch';
import { Readable } from 'stream';
import { AudioInfo } from './add.reaction';
import ytdl from 'ytdl-core-discord';
import Bot from '../../bot';
import { setTimeout } from 'timers';

const queue = [] as string[];
const removeFromQueue = (playId: string): void => {
    const index = queue.indexOf(playId);
    queue.splice(index, 1);
};

export const play = async (
    channel: VoiceChannel,
    audio: AudioInfo,
    bot: Omit<Bot, 'use'>,
    options: Omit<StreamOptions, 'type'> = {
        volume: .35
    }
): Promise<void> => {
    const member = bot.guildHelper.member(channel.guild);
    const playId = [Date.now(), Math.round(Math.random() * 100)].join();
    queue.push(playId);
    while (queue[0] !== playId) {
        const connection = member?.voice.connection;
        connection ?
            await new Promise((resolve) => connection.on('disconnect', resolve)) :
            await new Promise((resolve) => setTimeout(resolve, 200));
    }


    const stream = await download(audio);

    const resetName = await bot.guildHelper.changeName(
        audio.command,
        channel.guild
    );
    return channel.join().then((connection) =>
        new Promise<void>((resolve, reject) =>
            connection.play(stream, Object.assign({
                type: audio.source === 'youtube' ? 'opus' : 'unknown'
            }, options) as StreamOptions)
                .on('start', () => {
                    connection.once('disconnect', () => {
                        resolve();
                    });
                })
                .on('finish', () => {
                    removeFromQueue(playId);
                    connection.disconnect();
                })
                .on('error', reject)
        )).catch((e) => {
            throw e;
        }).finally(async () => {
            removeFromQueue(playId);
            if (queue.length < 1) {
                await resetName();
            }
        });
};

export const download = async (audio: AudioInfo): Promise<Readable> => audio.source === 'discord' ?
    await fetch(audio.url)
        .then((res) => res.body)
        .then((buffer) => Readable.from(buffer)) :
    await ytdl(audio.url);