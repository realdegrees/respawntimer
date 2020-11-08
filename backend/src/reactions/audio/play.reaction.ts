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
    AudioInfo>({name: 'play'}, async (context, audio) => {
        if (!context.message.member.voice.channel) {
            throw new VerboseError('You are not in a voicechannel!');
        }
        try {
            const resetName = await context.trigger.bot.changeName(
                audio.command,
                context.message.guild
            );
            const stream = audio.source === 'discord' ?
                await fetch(audio.url)
                    .then((res) => res.body)
                    .then((buffer) => Readable.from(buffer)) :
                await ytdl(audio.url);

            await play(
                context.message.member.voice.channel,
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
        pre: async (context) => {
            const command = context.message.content.trim();
            if (command === '') {
                throw new VerboseError('You didn\'t specify the audio you want to play!');
            }
            return context.trigger.db.firestore.doc<AudioInfo>(
                ['guilds', context.message.guild.id, 'audio', command].join('/')
            )
                .then(async (audio) => {
                    if (!audio) {
                        const sample = await getSampleTriggerCommand(
                            context.trigger,
                            context.message.guild);
                        throw new VerboseError(
                            `'${command}' is not a valid command!\nHint: Use ${sample} list`
                        );
                    } else {
                        return audio;
                    }

                });
        }
    });

