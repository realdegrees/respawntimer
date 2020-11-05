import { Message } from 'discord.js';
import { Url } from 'url';
import { VerboseError } from '../../common/errors/verbose.error';
import { GuildMessage, Reaction } from '../../common/reaction';
import { getSampleTriggerCommand } from '../../common/util';
import { notImplementedReaction } from '../default/not-implemented.reaction';

export const audioPlayReaction = new Reaction<
    GuildMessage,
    AudioInfo
>('play', async (message, context, audio) => notImplementedReaction.run(message as Message)
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

type AudioInfo = {
    url: Url;
    command: string;
};