import { ActionRowBuilder, Guild, RoleSelectMenuBuilder } from 'discord.js';
import { GuildData } from '../../db/guild.schema';
import { ESettingsID, Setting } from './settings';

export enum EAssistantSettingsOptions {
    ROLES = 'Roles'
}

export class AssistantSettings extends Setting {

    public static ID = 'Assistant Settings';


    public constructor() {
        super(ESettingsID.ASSISTANT);
        const assistantRoles = new RoleSelectMenuBuilder()
            .setCustomId(this.getCustomId(this.id, [EAssistantSettingsOptions.ROLES]))
            .setMinValues(0)
            .setMaxValues(10)
            .setPlaceholder('Choose Assistant Roles');

        const assistantRow = new ActionRowBuilder<RoleSelectMenuBuilder>()
            .addComponents(assistantRoles);

        this.init(
            'Assistant Settings',
            `Assistants can control the bot via the widget but are not allowed to edit the bot's settings`,
            'If neither Editor nor Assistant roles have been set anyone can control the bot via the widget and settings can only be changed by administrators.',
            assistantRow
        );
    }
    public async getCurrentSettings(guildData: GuildData, guild?: Guild | undefined): Promise<string> {
        return (await Promise.all(guildData.assistantRoleIDs.map((id) => guild?.roles.fetch(id))))
            .filter((role) => !!role)
            .map((role) => `${role}\n`)
            .join('');
    }

}