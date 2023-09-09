/* eslint-disable max-len */
import { SlashCommandBuilder } from '@discordjs/builders';
import { RESTPostAPIApplicationCommandsJSONBody } from 'discord-api-types/v9';
import { Command } from '../common/command';
import {
    ActionRowBuilder,
    ButtonInteraction,
    CacheType,
    Client,
    CommandInteraction,
    EmbedBuilder,
    RoleSelectMenuBuilder
} from 'discord.js';
import { default as DBGuild } from '../db/guild.schema';

export const settingsIds = {
    editor: 'editor',
    assistant: 'assistant'
};
export class CommandSet extends Command {
    public constructor(protected client: Client) {
        super('settings', 'Change Bot Settings', client);
    }
    public build(): RESTPostAPIApplicationCommandsJSONBody {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(this.description)
            .toJSON();
    }
    // eslint-disable-next-line @typescript-eslint/require-await, @typescript-eslint/no-explicit-any
    public async execute(interaction: CommandInteraction<CacheType>): Promise<void> {
        this.checkPermission(interaction, 'editor').then(() => {
            openSettings(interaction);
        }).catch(async (msg) => {
            await interaction.reply({
                ephemeral: true,
                content: msg
            });
        });
    }
}
// eslint-disable-next-line max-len
export const openSettings = async (interaction: ButtonInteraction<CacheType> | CommandInteraction<CacheType>): Promise<void> => {
    const guild = interaction.guild;
    if (!guild) {
        return Promise.reject();
    }
    const dbGuild = await DBGuild.findById(guild.id).then((obj) => obj ?? new DBGuild({
        _id: guild.id,
        name: guild.name,
        assistantRoleIDs: [],
        editorRoleIDs: []
    }).save());


    const editorRoles = new RoleSelectMenuBuilder()
        .setCustomId(`${settingsIds.editor}`)
        .setMinValues(0)
        .setMaxValues(10)
        .setPlaceholder('Choose Editor Roles');
    const assistantRoles = new RoleSelectMenuBuilder()
        .setCustomId(`${settingsIds.assistant}`)
        .setMinValues(0)
        .setMaxValues(10)
        .setPlaceholder('Choose Assistant Roles');
    const editorRow = new ActionRowBuilder<RoleSelectMenuBuilder>()
        .addComponents(editorRoles);
    const assistantRow = new ActionRowBuilder<RoleSelectMenuBuilder>()
        .addComponents(assistantRoles);
    await interaction.reply({
        ephemeral: true, embeds: [new EmbedBuilder()
            .setAuthor({ iconURL: 'https://cdn3.emoji.gg/emojis/2637-settings.png', name: 'Settings' })
            .setThumbnail('https://cdn.discordapp.com/avatars/993116789284286484/c5d1f8c2507c7f2a56a2a330109e66d2?size=1024')
            .setFooter({
                text: 'If neither Editor nor Assistant roles have been set anyone can control the bot ' +
                    'via the widget and settings can only be changed by administrators.',
                iconURL: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/39/Orange_exclamation_mark.svg/240px-Orange_exclamation_mark.svg.png'
            })
            .setDescription(`**Editor Roles**  
                    Editors can create new widgets and adjust the bot's settings.  
                    They can also control the bot via the widget.\n
                    **Assistant Roles**  
                    Assistants can control the bot via the widget but are not allowed to edit the bot's settings.`),
        new EmbedBuilder()
            .setFooter({
                text: 'Chosen roles are saved automatically. This message can be dismissed after selection.'
            })
            .setAuthor({ iconURL: 'https://cdn3.emoji.gg/emojis/2637-settings.png', name: 'Current Settings' })
            .setDescription(`**Editor Roles**  
                    ${(await Promise.all(dbGuild.editorRoleIDs.map(async (id) => await guild.roles.fetch(id)))).map((role) => `${role}\n`).join('')}
                    **Assistant Roles**  
                    ${(await Promise.all(dbGuild.assistantRoleIDs.map(async (id) => await guild.roles.fetch(id)))).map((role) => `${role}\n`).join('')}
`)],
        components: [editorRow, assistantRow]
    });
};