/* eslint-disable max-len */
import { SlashCommandBuilder } from '@discordjs/builders';
import { RESTPostAPIApplicationCommandsJSONBody } from 'discord-api-types/v9';
import { CacheType, ChannelType, Client, CommandInteraction } from 'discord.js';
import { Command } from '../common/command';
import { Widget } from '../common/widget';
import logger from '../../lib/logger';




export class Create extends Command {
    public constructor(protected client: Client) {
        super('create', 'Creates a wartimer widget in the current channel', client);
    }

    public build(): RESTPostAPIApplicationCommandsJSONBody {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(this.description)
            .toJSON();
    }
    // eslint-disable-next-line @typescript-eslint/require-await
    public async execute(interaction: CommandInteraction<CacheType>): Promise<unknown> {
        return this.checkPermission(interaction, 'editor').then(async () => {
            const channel = interaction.channel;
            const guild = interaction.guild;
            if (!guild) {
                return interaction.reply('This cannot be used in DMs');
            }
            if (!channel || channel.type !== ChannelType.GuildText) {
                return interaction.reply({ ephemeral: true, content: 'Invalid channel' });
            }
            return Widget.create(interaction, guild, channel);
        }).catch(async (msg) => {
            await interaction.reply({
                ephemeral: true,
                content: msg?.toString()
            }).catch(logger.error);
        });


    }
}
