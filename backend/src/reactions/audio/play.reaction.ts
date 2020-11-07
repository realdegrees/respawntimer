import { StreamOptions, VoiceChannel } from 'discord.js';
import { Readable } from 'stream';
import ytdl from 'ytdl-core-discord';
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
            connection.play(audio, options).on('finish', () => {
                connection.once('disconnect', () => {
                    resolve();
                });
                connection.disconnect();
            }).on('error', reject)));
};

export const audioPlayReaction = new Reaction<
    GuildMessage,
    AudioInfo>('play', async (message, context, audio) => {
        if (!message.member.voice.channel) {
            throw new VerboseError('You are not in a voicechannel!');
        }
        try {
            const resetName = await context.trigger.bot.changeName(
                audio.command,
                message.guild
            );
            await play(
                message.member.voice.channel,
                audio.source === 'discord' ?
                    audio.url :
                    await ytdl(audio.url),
                {
                    type: audio.source === 'youtube' ? 'opus' : 'unknown',
                    volume: .5,
                    time: audio.time
                }).finally(resetName);
        } catch (e) {
            throw new VerboseError(
                `Unable to play '${audio.command}' from source '${audio.source}'`
            );
        }
    }, {
        pre: async (message, context) => {
            const command = message.content.trim();
            if (command === '') {
                throw new VerboseError('You didn\'t specify the audio you want to play!');
            }
            return context.trigger.db.firestore.get<AudioInfo>(
                [message.guild.id, 'audio', 'commands', command].join('/')
            )
                .then(async (audio) => {
                    if (!audio) {
                        const sample = await getSampleTriggerCommand(
                            context.trigger,
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

