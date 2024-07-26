/* eslint-disable max-len */
import { SlashCommandBuilder } from '@discordjs/builders';
import { RESTPostAPIApplicationCommandsJSONBody } from 'discord-api-types/v9';
import { CacheType, Client, CommandInteraction, EmbedBuilder, OAuth2Scopes, PermissionFlagsBits } from 'discord.js';
import { Command } from './command';
import { DBGuild } from '../common/types/dbGuild';
import { BULB_ICON_LINK, WARTIMER_ICON_LINK } from '../common/constant';


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
    public async execute(interaction: CommandInteraction<CacheType>, dbGuild: DBGuild): Promise<void> {
        await interaction.reply({
            ephemeral: true,
            embeds: [new EmbedBuilder()
                .setAuthor({ iconURL: WARTIMER_ICON_LINK, name: 'Respawn Timer' })
                .setTitle('🔗 Invite Link')
                .setURL(interaction.client.generateInvite(INVITE_SETTINGS))
                .setDescription(`Right-Click the link above and copy link to share the invite link with anyone`)
                .setFooter({iconURL: BULB_ICON_LINK, text: `You can also invite me to your server with the 'Add to Server' button in my bio`})
            ]
        });
    }
}
