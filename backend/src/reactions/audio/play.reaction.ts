import { StreamOptions, VoiceChannel } from 'discord.js';
import fetch from 'node-fetch';
import { Readable } from 'stream';
import ytdl from 'ytdl-core-discord';
import logger from '../../../lib/logger';
import { VerboseError } from '../../common/errors/verbose.error';
import { GuildMessage, Reaction } from '../../common/reaction';
import { getSampleTriggerCommand } from '../../common/util';
import { AudioInfo, AudioRange } from './add.reaction';

const play = async (
    channel: VoiceChannel,
    audio: Readable | string,
    options?: StreamOptions & {
        time?: AudioRange;
    }
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

export const audioPlayReaction = Reaction.create<
    GuildMessage,
    AudioInfo>('play', async (message, trigger, audio) => {
        if (!message.member.voice.channel) {
            throw new VerboseError('You are not in a voicechannel!');
        }
        try {
            const resetName = await trigger.bot.changeName(
                audio.command,
                message.guild
            );
            const stream = audio.source === 'discord' ?
                await fetch(audio.url)
                    .then((res) => res.body)
                    .then((buffer) => Readable.from(buffer)) :
                await ytdl(audio.url);

            await play(
                message.member.voice.channel,
                stream,
                {
                    type: audio.source === 'youtube' ? 'opus' : 'unknown',
                    volume: .5,
                    time: audio.time
                }).finally(resetName);
        } catch (e) {
            logger.error(e);
            throw new VerboseError(
                `Unable to play '${audio.command}' from source '${audio.source}'`
            );
        }
    }, {
        pre: async (message, trigger) => {
            const command = message.content.trim();
            if (command === '') {
                throw new VerboseError('You didn\'t specify the audio you want to play!');
            }
            return trigger.db.firestore.get<AudioInfo>(
                [message.guild.id, 'audio', 'commands', command].join('/')
            )
                .then(async (audio) => {
                    if (!audio) {
                        const sample = await getSampleTriggerCommand(
                            trigger,
                            message.guild);
                        throw new VerboseError(
                            `'${command}' is not a valid command!\nHint: Use ${sample} list`
                        );
                    } else {
                        return audio;
                    }

                });
        }
    });

