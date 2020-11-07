import { EmbedFieldData, MessageEmbed } from 'discord.js';
import { Reaction } from '../../common/reaction';
import { Trigger } from '../../common/types';
import { CommandOptions, TriggerOptions } from '../../common/types/trigger-options';
import { fetchPrefix } from '../../common/util';

export const helpReaction = Reaction.create('', async (message, trigger) => {
    const prefix = await fetchPrefix(message.guild, trigger.db);
    const fields: EmbedFieldData[] = trigger.bot.getTriggers()
        .filter((trigger) =>
            trigger.options?.commandOptions &&
            trigger.options.commandOptions.command.length >= 1 &&
            trigger.options.commandOptions.command.every((command) => command.length > 0))
        // This map is required because typescript apparently doesn't realize we 
        // filtered all triggers without this property
        .map((trigger) => trigger as Omit<Trigger, 'options'> & {
            options: Omit<TriggerOptions, 'commandOptions'> & {
                commandOptions: CommandOptions;
            };
        })
        .map((trigger) => {
            const commands = trigger.options.commandOptions.command;
            const aliases =
                commands.length >= 2 ? '_Alias: ' +
                    trigger.options.commandOptions.command.slice(1)
                        .map((command) => prefix + command)
                        .join(', ') + '_\n' : '';
            return {
                name: prefix + trigger.options.commandOptions.command[0],
                value: aliases + (trigger.options.description ?? 'No description available')
            };
        });
    const embed = new MessageEmbed()
        .setColor('GREEN')
        .setTitle(`${trigger.bot.getName(message.guild)} Help`) // TODO: Fetch bot name
        .setDescription(
            'List of possible commands.\n' +
            'Use "<prefix><command> help" for additional info.'
        ).addFields(fields);
    await message.channel.send(embed);
});