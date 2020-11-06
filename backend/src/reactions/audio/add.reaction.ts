import { extname } from 'path';
import youtubedl from 'youtube-dl';
import logger from '../../../lib/logger';
import { VerboseError } from '../../common/errors/verbose.error';
import { GuildMessage, Reaction } from '../../common/reaction';

export const audioAddReaction = new Reaction<GuildMessage, AudioInfo>('add', async (
    message,
    context,
    audio) => {
    return context.trigger.db.firestore.update(
        audio,
        [message.guild.id, 'audio', 'commands', audio.command].join('/')
    )
        .then(() => message.channel.send('I stored your new command!'))
        .catch((e) => logger.error(e));
}, {
    pre: async (message) => {
        const [command, url] = message.content.split(' ');
        const attachment = message.attachments.first();
        if (!command) {
            throw new VerboseError('You didn\'t provide a name for your command');
        }
        if (url) {
            await new Promise<youtubedl.Info>((resolve, reject) => {
                youtubedl.getInfo(url, (err, info) => {
                    err ? reject(err) : resolve(info);
                });
            }).catch(() => new VerboseError('The provided youtube link is invalid!'));
            return {
                command,
                url,
                source: 'youtube'
            };
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