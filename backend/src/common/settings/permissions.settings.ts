import { ActionRowBuilder, Guild, RoleSelectMenuBuilder } from 'discord.js';
import { GuildData } from '../../db/guild.schema';
import { ESettingsID, Setting } from './settings';
import { Document } from 'mongoose';

export enum EPermissionSettingsOptions {
    EDITOR = 'Editor',
    ASSISTANT = 'Assistant'
}

export class PermissionSettings extends Setting {
    public constructor() {
        super(ESettingsID.PERMISSIONS);
        const assistantRoles = new RoleSelectMenuBuilder()
            .setCustomId(this.getCustomId(this.id, [EPermissionSettingsOptions.ASSISTANT]))
            .setMinValues(0)
            .setMaxValues(10)
            .setPlaceholder('Choose Assistant Roles');

        const assistantRow = new ActionRowBuilder<RoleSelectMenuBuilder>()
            .addComponents(assistantRoles);
        const editorRoles = new RoleSelectMenuBuilder()
            .setCustomId(this.getCustomId(this.id, [EPermissionSettingsOptions.EDITOR]))
            .setMinValues(0)
            .setMaxValues(10)
            .setPlaceholder('Choose Editor Roles');

        const editorRow = new ActionRowBuilder<RoleSelectMenuBuilder>()
            .addComponents(editorRoles);

        this.init(
            'Permission Settings',
            `*Assistants* can control the bot via the widget but are not allowed to edit the bot's settings  
            *Editors* can create new widgets and adjust the bot's settings. They can also control the bot via the widget.`,
            'If neither Editor nor Assistant roles have been set anyone can control the bot via the widget and settings can only be changed by administrators.',
            editorRow, assistantRow
        );
    }
    public async getCurrentSettings(guildData: Document<unknown, object, GuildData> & GuildData & Required<{
        _id: string;
    }>, guild?: Guild | undefined): Promise<string> {
        return `**Editor Roles**  
                ${(await Promise.all(guildData.editorRoleIDs.map((id) => guild?.roles.fetch(id))))
                .filter((role) => !!role)
                .map((role) => `${role}`)
                .join('\n')}\n
                **Assistant Roles**  
                ${(await Promise.all(guildData.assistantRoleIDs.map((id) => guild?.roles.fetch(id))))
                .filter((role) => !!role)
                .map((role) => `${role}`)
                .join('\n')}`;
    }

}