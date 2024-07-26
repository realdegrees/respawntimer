/* eslint-disable max-len */
import { SlashCommandBuilder } from '@discordjs/builders';
import { RESTPostAPIApplicationCommandsJSONBody } from 'discord-api-types/v9';
import { CacheType, ChannelType, Client, CommandInteraction } from 'discord.js';
import { Command } from './command';
import { Widget } from '../common/widget';
import logger from '../../lib/logger';
import { setTimeout } from 'timers/promises';
import { DBGuild } from '../common/types/dbGuild';




export class Create extends Command {
    public constructor(protected client: Client) {
        super('create', 'Creates a wartimer widget in the current channel', client);
    }

    public build(): RESTPostAPIApplicationCommandsJSONBody {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(this.description)
            .setDMPermission(false)
            .toJSON();
    }
    public async execute(interaction: CommandInteraction<CacheType>, dbGuild: DBGuild): Promise<unknown> {
        return this.checkPermission(interaction, 'editor')
            .then(async () => {
                const channel = interaction.channel;
                if (!channel || channel.type !== ChannelType.GuildText) {
                    return interaction.reply({ ephemeral: true, content: 'Invalid Channel! This must be used on a server.' });
                }
                return Widget.create(interaction, channel);
            })
            .then(() => interaction.reply({ content: 'Widget Created ✅' }))
            .then(() => setTimeout(800))
            .then(() => interaction.deleteReply())
            .catch(async (msg) => interaction.reply({
                ephemeral: true,
                content: msg?.toString()
            }))
            .catch(logger.error);


    }
}
