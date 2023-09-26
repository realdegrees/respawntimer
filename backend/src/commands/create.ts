/* eslint-disable max-len */
import { SlashCommandBuilder } from '@discordjs/builders';
import { RESTPostAPIApplicationCommandsJSONBody } from 'discord-api-types/v9';
import { CacheType, ChannelType, Client, CommandInteraction } from 'discord.js';
import { Command } from './command';
import { Widget } from '../widget';
import logger from '../../lib/logger';
import { setTimeout } from 'timers/promises';
import { DBGuild } from '../common/types/dbGuild';
import { EPHEMERAL_REPLY_DURATION_SHORT } from '../common/constant';
import Database from '../db/database';




export class Create extends Command {
    public constructor(protected client: Client) {
        super('create', 'Creates a respawn timer widget in the current channel', client);
    }

    public build(): RESTPostAPIApplicationCommandsJSONBody {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(this.description)
            .setDMPermission(false)
            .toJSON();
    }
    public async execute(interaction: CommandInteraction<CacheType>): Promise<void> {
        if (!interaction.guild) {
            throw new Error('This command can only be run on a server.');
        }
        const dbGuild = await Database.getGuild(interaction.guild);
        await interaction.deferReply({ ephemeral: true });
        const hasPermission = await this.checkPermission(interaction, 'editor');
        if (hasPermission) {
            const channel = interaction.channel;
            if (!channel || channel.type !== ChannelType.GuildText) {
                throw new Error('Invalid Channel! This must be used on a server.');
            }
            await Widget.create(interaction, channel, dbGuild);
            // Respond to the interaction
            await interaction.editReply({
                content: 'Widget Created ✅',
            }).catch(logger.error);
            await setTimeout(EPHEMERAL_REPLY_DURATION_SHORT);
            await interaction.deleteReply()
                .catch(logger.error);
        } else {
            throw new Error('You must have editor permissions to use this command!\n' +
                'Ask an administrator or editor to adjust the bot `/settings`');
        }

    }
}
