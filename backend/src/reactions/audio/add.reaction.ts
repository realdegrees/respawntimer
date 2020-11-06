import { extname } from 'path';
import ytdl from 'ytdl-core-discord';
import logger from '../../../lib/logger';
import { VerboseError } from '../../common/errors/verbose.error';
import { GuildMessage, Reaction } from '../../common/reaction';

export const audioAddReaction = new Reaction<GuildMessage, AudioInfo>('add', async (
    message,
    context,
    audio) => {
    return context.trigger.db.firestore.store(
        audio,
        [message.guild.id, 'audio', 'commands', audio.command].join('/'),

    )
        .then(() => message.channel.send('I stored your new command!'))
        .catch((e) => {
            logger.error(e);
            throw new VerboseError(
                'Error storing the command, if the command already exists try \''
                + audioUpdateReaction + '\' to change the command.'
            );
        });
}, {
    pre: async (message) => {
        const [command, url] = message.content.split(' ');
        const attachment = message.attachments.first();
        if (!command) {
            throw new VerboseError('You didn\'t provide a name for your command');
        }
        if (url) {
            try {
                await ytdl.getBasicInfo(url);
                return {
                    command,
                    url,
                    source: 'youtube'
                };
            } catch (e) {
                throw new VerboseError(
                    'The provided youtube link is invalid or the video is not available!'
                );
            }
        } else if (attachment) {
            const attachmentData = attachment;
            const fileType = extname(attachmentData.url);
            if (fileType !== '.mp3') {
                throw new VerboseError('The provided attachment is not an mp3!');
            }

            return {
                command,
                url: attachmentData.url,
                source: 'discord'
            };
        } else {
            throw new VerboseError(
                'You must either attach an audio file or provide a youtube link!'
            );
        }
    }
});

export interface AudioInfo {
    url: string;
    command: string;
    source: 'discord' | 'youtube';
}