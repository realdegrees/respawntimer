import { ActionRowBuilder, Guild, RoleSelectMenuBuilder } from 'discord.js';
import { GuildData } from '../../db/guild.schema';
import { ESettingsID, Setting } from './settings';

export enum EEditorSettingsOptions {
    ROLES = 'Roles'
}

export class EditorSettings extends Setting {

    public constructor() {
        super(ESettingsID.EDITOR);
        const editorRoles = new RoleSelectMenuBuilder()
            .setCustomId(this.getCustomId(this.id, [EEditorSettingsOptions.ROLES]))
            .setMinValues(0)
            .setMaxValues(10)
            .setPlaceholder('Choose Editor Roles');

        const editorRow = new ActionRowBuilder<RoleSelectMenuBuilder>()
            .addComponents(editorRoles);

        this.init(
            'Editor Settings',
            `Editors can create new widgets and adjust the bot's settings.They can also control the bot via the widget.`,
            `If neither Editor nor Assistant roles have been set anyone can control the bot via the widget and settings can only be changed by administrators.`,
            editorRow
        );
    }
    public async getCurrentSettings(guildData: GuildData, guild?: Guild | undefined): Promise<string> {
        return (await Promise.all(guildData.editorRoleIDs.map((id) => guild?.roles.fetch(id))))
            .filter((role) => !!role)
            .map((role) => `${role}\n`)
            .join('');
    }
}