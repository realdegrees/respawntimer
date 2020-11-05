import { MessageAttachment } from 'discord.js';
import { extname } from 'path';
import youtubedl from 'youtube-dl';
import { GuildMessage, Reaction } from '../../common/reaction';

export const audioAddReaction = new Reaction<GuildMessage, AudioAddPreprocessed>('add', async (
    message,
    context,
    audio) => {
        if(!audio) {
            throw new Error('Something went wrong');
        }
        await context.trigger.db.firestore.update({
            url: audio.audioUrl,
            source: audio.source
        }, [message.guild.id, 'audio', audio.commandName].join('/'));
        await message.channel.send('I stored your new command!');
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
                commandName,
                source: 'youtube'
            };
        } else if (message.attachments.first()){
            const attachmentData = message.attachments.first() as MessageAttachment;
            const fileType = extname(attachmentData.url);
            if(fileType !== 'mp3'){
                throw new Error('The provided attachment is not an mp3!');
            }
            
            const audioUrl =  await context.trigger.db.storage.saveAudio(
                [message.guild.id, 'audio', attachmentData.name]
                    .join('/')
                    .concat(extname(attachmentData.url)),
                attachmentData.attachment as Buffer
            );

            return {
                audioUrl,
                commandName,
                source: 'storage'
            };
        }
        return;
    }
});
interface AudioAddPreprocessed {
    commandName: string;
    audioUrl: string;
    source: 'storage' | 'youtube';
}