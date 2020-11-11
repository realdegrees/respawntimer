import { EmbedFieldData, MessageEmbed } from 'discord.js';
import { VerboseError } from '../../common/errors/verbose.error';
import { GuildMessage, Reaction } from '../../common/reaction';
import { executeWithChance, getSampleTriggerCommand } from '../../common/util';
import { AudioInfo } from './add.reaction';
import { audioSoundBoardReaction } from './soundboard.reaction';

export const audioListReaction = Reaction.create<GuildMessage>({
    name: 'list',
    shortDescription: 'List all available user-added audio commands'
}, {
    message: async (context) => {
        const commands = await context.trigger.db.firestore
            .collection<AudioInfo>(['guilds', context.message.guild.id, 'audio'].join('/'));
        if (commands.length === 0) {
            throw new VerboseError('There are no audio commands on this server (yet).');
        }
        const embed = new MessageEmbed()
            .setTitle('Audio commands for ' + context.message.guild.name)
            .addFields(commands.map((command) => {
                // ! 1% Chance to get rick rolled
                const link = executeWithChance(.01,
                    () => 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
                ) ?? command.data.url;
                return {
                    name: command.id,
                    value: `[Link](${link})`,
                    inline: true
                } as EmbedFieldData;
            }))
            .setFooter('Hint: You can create a soundboard from these with ' +
                await getSampleTriggerCommand(context.trigger, context.message.guild, {
                    subTrigger: audioSoundBoardReaction.options.name
                }));
        await context.message.channel.send(embed);
    }
});