import { MessageAttachment } from 'discord.js';
import { ReadStream } from 'fs';
import { extname } from 'path';
import { Url } from 'url';
import youtubedl from 'youtube-dl';
import { GuildMessage, Reaction } from '../../common/reaction';

const audioAddReaction = new Reaction<GuildMessage, AudioAddPreprocessed>('add', (
    message,
    context,
    audio) => {
    return Promise.reject('Audio add not implemented');
}, {
    pre: async (message, context) => {
        const [commandName, audioUrl] = message.content.split(' ');
        if (!commandName) {
            throw new Error('You didn\'t provide a name for your command');
        }
        if (!audioUrl && !message.attachments.first()?.attachment) {
            throw new Error('You must either attach an audio file or provide a youtube link!');
        }
        if (audioUrl) {
            await new Promise<youtubedl.Info>((resolve, reject) => {
                youtubedl.getInfo(audioUrl, (err, info) => {
                    err ? reject(err) : resolve(info);
                });
            });
            return {
                audioUrl,
                commandName
            };
        } else {
            const attachmentData = message.attachments.first() as MessageAttachment;
            const audioUrl =  await context.trigger.db.storage.saveAudio(
                [message.guild.id, 'audio', attachmentData.name]
                    .join('/')
                    .concat(extname(attachmentData.url)),
                attachmentData.attachment
            )
        }

        if (message.content.split(' ').length >= 2) {
            const response = await fetch(message.content);
            const buffer = await response.arrayBuffer();
            return new ReadStream({
                read() {
                    this.push(buffer);
                    this.push(null);
                }
            });
        } else {

        }
    }
});
interface AudioAddPreprocessed {
    commandName: string;
    audioUrl: Url;
}