import { MessageAttachment } from 'discord.js';
import { extname } from 'path';
import youtubedl from 'youtube-dl';
import logger from '../../../lib/logger';
import { InternalError } from '../../common/errors/internal.error';
import { VerboseError } from '../../common/errors/verbose.error';
import { GuildMessage, Reaction } from '../../common/reaction';

export const audioAddReaction = new Reaction<GuildMessage, AudioAddPreprocessed>('add', async (
    message,
    context,
    audio) => {
    if (!audio) {
        throw new InternalError('Something went wrong');
    }
    return context.trigger.db.firestore.update({
        url: audio.audioUrl,
        source: audio.source
    }, [message.guild.id, 'audio', 'commands', audio.commandName].join('/'))
        .then(() => message.channel.send('I stored your new command!'))
        .catch((e) => logger.error(e));
}, {
    pre: async (message) => {
        const [commandName, url] = message.content.split(' ');
        if (!commandName) {
            throw new VerboseError('You didn\'t provide a name for your command');
        }
        if (!url && !message.attachments.first()?.attachment) {
            throw new VerboseError(
                'You must either attach an audio file or provide a youtube link!'
            );
        }
        if (url) {
            await new Promise<youtubedl.Info>((resolve, reject) => {
                youtubedl.getInfo(url, (err, info) => {
                    err ? reject(err) : resolve(info);
                });
            }).catch(() => new VerboseError('The provided youtube link is invalid!'));
            return {
                audioUrl: url,
                commandName,
                source: 'youtube'
            };
        } else if (message.attachments.first()) {
            const attachmentData = message.attachments.first() as MessageAttachment;
            const fileType = extname(attachmentData.url);
            if (fileType !== '.mp3') {
                throw new VerboseError('The provided attachment is not an mp3!');
            }

            return {
                audioUrl: attachmentData.url,
                commandName,
                source: 'discord'
            };
        }
        return;
    }
});
interface AudioAddPreprocessed {
    commandName: string;
    audioUrl: string;
    source: 'discord' | 'youtube';
}