import { EmbedFieldData, MessageEmbed } from 'discord.js';
import { GuildMessage, Reaction } from '../../common/reaction';
import { getSampleTriggerCommand } from '../../common/util';
import { AudioInfo } from './add.reaction';
import { audioSoundBoardReaction } from './soundboard.reaction';

export const audioListReaction = Reaction.create<GuildMessage>(
    {
        name: 'list'
    }, async (context) => {
        const commands = await context.trigger.db.firestore
            .collection<AudioInfo>(['guilds', context.message.guild, 'audio'].join('/'));
        const embed = new MessageEmbed()
            .setTitle('Audio commands for ' + context.message.guild.name)
            .addFields(commands.map((command) => ({
                name: command.id,
                value: command.data.url
            } as EmbedFieldData)))
            .setFooter('_Hint: You can create a soundboard from these with *' +
                getSampleTriggerCommand(context.trigger, context.message.guild, {
                    subTrigger: audioSoundBoardReaction.options.name
                }) + '*_');
        await context.message.channel.send(embed);
    });