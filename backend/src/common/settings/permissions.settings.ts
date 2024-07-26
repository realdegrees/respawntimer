import { ActionRowBuilder, AnySelectMenuInteraction, ButtonInteraction, CacheType, Guild, Interaction, MessageComponentInteraction, ModalSubmitInteraction, RoleSelectMenuBuilder, RoleSelectMenuInteraction } from 'discord.js';
import { GuildData } from '../../db/guild.schema';
import { ESettingsID, BaseSetting } from './base.setting';
import { Document } from 'mongoose';
import { DBGuild } from '../types/dbGuild';
import { Widget } from '../widget';

export enum EPermissionSettingsOptions {
    EDITOR = 'Editor',
    ASSISTANT = 'Assistant'
}

export class PermissionSettings extends BaseSetting<RoleSelectMenuBuilder> {


    public constructor() {
        super(ESettingsID.PERMISSIONS,
            'Permission Settings',
            `*Assistants* can control the bot via the widget but are not allowed to edit the bot's settings  
            *Editors* can create new widgets and adjust the bot's settings. They can also control the bot via the widget.`,
            'If neither Editor nor Assistant roles have been set anyone can control the bot via the widget and settings can only be changed by administrators.'
        );
    }
    public getSettingsRows() {
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

        return Promise.resolve([editorRow, assistantRow]);
    }
    public async getCurrentSettings(guildData: DBGuild, guild?: Guild | undefined): Promise<string> {
        return `**Editor Roles**  
                ${await Promise.all(guildData.editorRoleIDs.map((id) => guild?.roles.fetch(id)))
                .then((roles) =>
                    roles.filter((role) => !!role)
                        .map((role) => `${role}`)
                        .join('\n')
                ).catch(() => ['Unable to retrieve roles'])}\n
                **Assistant Roles**  
                ${await Promise.all(guildData.assistantRoleIDs.map((id) => guild?.roles.fetch(id)))
                .then((roles) =>
                    roles.filter((role) => !!role)
                        .map((role) => `${role}`)
                        .join('\n')
                ).catch(() => ['Unable to retrieve roles'])}`;
    }
    public async onInteract(
        dbGuild: DBGuild,
        interaction: ButtonInteraction | ModalSubmitInteraction | AnySelectMenuInteraction,
        widget: Widget | undefined,
        option: string
    ): Promise<unknown> {
        switch (option) {
            case EPermissionSettingsOptions.EDITOR:
                if (!interaction.isRoleSelectMenu()) return Promise.reject('Interaction ID mismatch, try resetting the bot in the toptions if this error persists.');
                dbGuild.editorRoleIDs = interaction.roles.map((role) => role.id);
                break;
            case EPermissionSettingsOptions.ASSISTANT:
                if (!interaction.isRoleSelectMenu()) return Promise.reject('Interaction ID mismatch, try resetting the bot in the toptions if this error persists.');
                dbGuild.assistantRoleIDs = interaction.roles.map((role) => role.id);
                break;
        }
        return dbGuild.save().then(() => this.send(interaction, dbGuild, { update: true }));
    }
}