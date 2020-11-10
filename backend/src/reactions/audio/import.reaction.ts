import logger from '../../../lib/logger';
import { VerboseError } from '../../common/errors/verbose.error';
import { GuildMessage, Reaction } from '../../common/reaction';
import { AudioInfo } from './add.reaction';

export const audioImportReaction = Reaction.create<GuildMessage>({
    name: 'import'
}, async (context) => {
    const guildId = context.message.content.split(' ')[0].trim();
    try {
        const audios = await context.trigger.db.firestore.collection<AudioInfo>(
            ['guilds', guildId, 'audio'].join('/'),
            [{ property: 'type', operator: '==', value: 'youtube' }]
        );
        await context.message.channel.send(`Found ${audios.length} audio commands.`);
        await Promise.all(audios.map(
            (audio) => context.trigger.db.firestore.store(
                ['guilds', context.message.guild.id, 'audio', audio.id].join('/'),
                audio.data
            )
        ));
        return await context.message.channel.send('Import successful!');
    } catch (e) {
        logger.warn(e);
        throw new VerboseError('Import failed!');
    }
});