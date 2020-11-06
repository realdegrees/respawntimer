import fetch from 'node-fetch';
import { Readable } from 'stream';
import { VerboseError } from '../../common/errors/verbose.error';
import { GuildMessage, Reaction } from '../../common/reaction';
import { getSampleTriggerCommand } from '../../common/util';
import { AudioInfo } from './add.reaction';

export const audioPlayReaction = new Reaction<
    GuildMessage,
    AudioInfo
>('play', async (message, context, audio) => {
    if (audio.source === 'discord') {
        const connection = await message.member.voice.channel?.join();

        if (!connection) {
            throw new VerboseError('You are not in a voicechannel.');
        }
        const buffer = await fetch(audio.url).then((res) => res.buffer());
        const resetName = await context.trigger.bot.changeName(
            audio.command,
            message.guild
        );
        await new Promise((resolve) =>
            connection.play(Readable.from(buffer), {
                volume: 30,
            }).on('finish', resolve));

        await new Promise((resolve) => {
            connection.once('disconnect', () => {
                connection.dispatcher.destroy();
                resolve();
            });
            connection.disconnect();
        }).finally(resetName);
    } else {
        throw new VerboseError(
            'This command uses a youtube link,' +
            'this functionality is not yet implemented');
    }
}
    , {
        pre: async (message, context) => {
            const command = message.content.trim();
            if (command === '') {
                throw new VerboseError('You didn\'t specify the audio you want to play!');
            }
            return context.trigger.db.firestore.get<AudioInfo>(
                [message.guild.id, 'audio', 'commands', command].join('/')
            )
                .catch(async () => {
                    const sample = await getSampleTriggerCommand(context.trigger, message.guild, {
                        subTrigger: context.name
                    });
                    throw new VerboseError(
                        `${command} is not a valid command! Use ${sample} list `
                    );
                });
        }
    });

