/* eslint-disable max-len */
import { SlashCommandBuilder } from '@discordjs/builders';
import { RESTPostAPIApplicationCommandsJSONBody } from 'discord-api-types/v9';
import { CacheType, ChannelType, Client, CommandInteraction, OAuth2Scopes, PermissionFlagsBits, PermissionsBitField } from 'discord.js';
import { Command } from './command';
import { Widget } from '../common/widget';
import logger from '../../lib/logger';
import { setTimeout } from 'timers/promises';
import { DBGuild } from '../common/types/dbGuild';


export const INVITE_SETTINGS = {
    scopes: [OAuth2Scopes.Bot, OAuth2Scopes.ApplicationsCommands],
    permissions: [
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.Speak,
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.ViewChannel]
};

export class Invite extends Command {
    public constructor(protected client: Client) {
        super('invite', 'Sends an invite link for the bot', client);
    }

    public build(): RESTPostAPIApplicationCommandsJSONBody {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(this.description)
            .toJSON();
    }
    public async execute(interaction: CommandInteraction<CacheType>, dbGuild: DBGuild): Promise<unknown> {
        return interaction.reply({
            ephemeral: true,
            content: interaction.client.generateInvite(INVITE_SETTINGS)
        }).catch(logger.error);


    }
}
