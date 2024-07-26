import {
	ActionRowBuilder,
	AnySelectMenuInteraction,
	ButtonInteraction,
	ButtonStyle,
	CacheType,
	EmbedField,
	Guild,
	Interaction,
	MessageComponentInteraction,
	ModalSubmitInteraction,
	RoleSelectMenuBuilder,
	RoleSelectMenuInteraction
} from 'discord.js';
import { GuildData } from '../../db/guild.schema';
import { ESettingsID, BaseSetting } from './base.setting';
import { Document } from 'mongoose';
import { DBGuild } from '../types/dbGuild';
import { Widget } from '../../widget';
import { SettingsPostInteractAction } from '../types/settingsPostInteractActions';
import { userHasRole } from '../../util/permissions';

export enum EPermissionSettingsOptions {
	EDITOR = 'Editor',
	ASSISTANT = 'Assistant'
}

export class PermissionSettings extends BaseSetting<RoleSelectMenuBuilder> {
	public constructor() {
		super(
			ESettingsID.PERMISSIONS,
			ButtonStyle.Primary,
			'Permission Settings',
			`*Assistants* can control the bot via the widget but are not allowed to edit the bot's settings  
            *Editors* can create new widgets and adjust the bot's settings. They can also control the bot via the widget.`,
			'If Assistant roles are not set everyone can control the bot via the widget.\nSettings are always only accessible by admins and editors.'
		);
	}
	public getSettingsRows(
		dbGuild: DBGuild,
		interaction: ButtonInteraction | ModalSubmitInteraction | AnySelectMenuInteraction
	) {
		const assistantRoles = new RoleSelectMenuBuilder()
			.setCustomId(this.getCustomId(this.id, [EPermissionSettingsOptions.ASSISTANT]))
			.setMinValues(0)
			.setMaxValues(10)
			.setPlaceholder('Choose Assistant Roles');

		const assistantRow = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
			assistantRoles
		);
		const editorRoles = new RoleSelectMenuBuilder()
			.setCustomId(this.getCustomId(this.id, [EPermissionSettingsOptions.EDITOR]))
			.setMinValues(0)
			.setMaxValues(10)
			.setPlaceholder('Choose Editor Roles');

		const editorRow = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(editorRoles);

		return Promise.resolve([editorRow, assistantRow]);
	}
	public async getCurrentSettings(guildData: DBGuild, guild?: Guild | undefined) {
		const editorRoles = await Promise.all(
			guildData.editorRoleIDs.map((id) => guild?.roles.fetch(id))
		)
			.then((roles) =>
				roles
					.filter((role) => !!role)
					.map((role) => `${role}`)
					.join('\n')
			)
			.catch(() => ['Unable to retrieve roles']);
		const assistantRoles = await Promise.all(
			guildData.assistantRoleIDs.map((id) => guild?.roles.fetch(id))
		)
			.then((roles) =>
				roles
					.filter((role) => !!role)
					.map((role) => `${role}`)
					.join('\n')
			)
			.catch(() => ['Unable to retrieve roles']);

		return [
			{
				name: `Editor Roles`,
				value: editorRoles || 'None'
			},
			{
				name: `Assistant Roles`,
				value: assistantRoles || 'None'
			}
		] as EmbedField[];
	}
	public async onInteract(
		dbGuild: DBGuild,
		interaction: ButtonInteraction | ModalSubmitInteraction | AnySelectMenuInteraction,
		widget: Widget | undefined,
		option: string
	): Promise<SettingsPostInteractAction[]> {
		if (!interaction.isRoleSelectMenu())
			return Promise.reject(
				'Interaction ID mismatch, try resetting the bot in the toptions if this error persists.'
			);
		if (!interaction.guild)
			return Promise.reject('Unable to retrieve server data, please try again in a few minutes');
		const roleIds = interaction.roles.map((role) => role.id);
		switch (option) {
			case EPermissionSettingsOptions.EDITOR:
				const perm = await userHasRole(interaction.guild, interaction.user, roleIds);
				if (perm) {
					dbGuild.editorRoleIDs = roleIds;
					return ['saveGuild', 'update'];
				} else {
					return Promise.reject(
						'Unable to complete request. This action would remove your editor permissions!'
					);
				}
			case EPermissionSettingsOptions.ASSISTANT:
				dbGuild.assistantRoleIDs = roleIds;
				return ['saveGuild', 'update', 'updateWidget'];
			default:
				return Promise.reject('ID Mismatch');
		}
	}
}
