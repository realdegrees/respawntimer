import {
	ActionRowBuilder,
	AnySelectMenuInteraction,
	BaseSelectMenuBuilder,
	ButtonBuilder,
	ButtonInteraction,
	ButtonStyle,
	CacheType,
	ChannelSelectMenuBuilder,
	ChannelSelectMenuInteraction,
	ChannelType,
	Colors,
	EmbedBuilder,
	Guild,
	GuildChannel,
	Interaction,
	MessageComponentInteraction,
	ModalSubmitInteraction,
	RoleSelectMenuBuilder,
	StringSelectMenuBuilder
} from 'discord.js';
import { GuildData } from '../../db/guild.schema';
import { ESettingsID, BaseSetting } from './base.setting';
import { checkChannelPermissions } from '../../util/permissions';
import { Document } from 'mongoose';
import { DBGuild } from '../types/dbGuild';
import logger from '../../../lib/logger';
import { debug } from '../constant';
import { Widget } from '../../widget';
import { NotificationHandler, UPDATE_SOURCE_SERVER_ID } from '../../handlers/notificationHandler';
import { SettingsPostInteractAction } from '../types/settingsPostInteractActions';
import {
	AdvancedChannelSelectMenuBuilder,
	EAdvancedChannelSelectReturnValue
} from '../../util/advancedChannelSelectMenuBuilder';
import { setTimeout } from 'timers/promises';

export enum ENotificationSettingsOptions {
	UPDATE_CHANNEL = 'updatechannel'
}
export class NotificationSettings extends BaseSetting<StringSelectMenuBuilder> {
	private channelSelectPage = 1;
	private channelSelectCache: GuildChannel[] | undefined;
	public constructor() {
		super(
			ESettingsID.NOTIFICATIONS,
			ButtonStyle.Primary,
			'Notification Settings',
			`**Notification Channel**  
            This channel will receive notifications about updates and new features.  
            If the bot encounters any errors you will also get notified about it in this channel.`,
			''
		);
	}
	public async getSettingsRows(
		dbGuild: DBGuild,
		interaction: ButtonInteraction | ModalSubmitInteraction | AnySelectMenuInteraction
	) {
		const channelSelectMenu = await new AdvancedChannelSelectMenuBuilder(
			interaction.guild!,
			interaction.user,
			{ allowUnset: true }
		)
			.setCustomId(this.getCustomId(this.id, [ENotificationSettingsOptions.UPDATE_CHANNEL]))
			.setChannelType(ChannelType.GuildText)
			.setChannelCache(this.channelSelectCache)
			.setPage(this.channelSelectPage)
			.build();

		this.channelSelectCache = channelSelectMenu.getChannelCache();

		const channelRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
			channelSelectMenu.getMenu()
		);
		return Promise.resolve([channelRow]);
	}
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public async getCurrentSettings(guildData: DBGuild, guild?: Guild | undefined) {
		const channel = guildData.notificationChannelId
			? await guild?.channels.fetch(guildData.notificationChannelId).catch(() => undefined)
			: undefined;
		return channel && channel.isTextBased()
			? checkChannelPermissions(channel, ['ViewChannel', 'SendMessages'])
					.then(() => `**Notification Channel**\n${channel}`)
					.catch((reason) => `**Notification Channel**\n${channel}\n\n⚠️ ${reason}`)
			: `**Notification Channel**\n*None*`;
	}
	public async onInteract(
		dbGuild: DBGuild,
		interaction: ButtonInteraction | ModalSubmitInteraction | AnySelectMenuInteraction,
		widget: Widget | undefined,
		option: string
	): Promise<SettingsPostInteractAction[]> {
		if (!interaction.guild)
			return Promise.reject('Unable to complete request! Cannot retrieve server data');
		switch (option) {
			case 'makenewclearchannelbuttonhere':
				await NotificationHandler.sendNotification(
					dbGuild,
					'Notifications',
					'This channel will not receive any more notifications and dev updates!',
					{ color: Colors.Red }
				);
				dbGuild.notificationChannelId = undefined;
				this.channelSelectPage = 1;
				return ['saveGuild', 'update', 'updateWidget'];
				break;
			case ENotificationSettingsOptions.UPDATE_CHANNEL:
				if (!interaction.isStringSelectMenu())
					return Promise.reject(
						'Interaction ID mismatch, try resetting the bot in the toptions if this error persists.'
					);
				if (interaction.guild.id === UPDATE_SOURCE_SERVER_ID && !debug)
					return Promise.reject('This setting cannot be changed on this server.');

				const value = interaction.values[0];

				if (value === EAdvancedChannelSelectReturnValue.NEXT_PAGE) {
					this.channelSelectPage += 1;
					return ['update'];
				} else if (value === EAdvancedChannelSelectReturnValue.PREV_PAGE) {
					this.channelSelectPage -= 1;
					return ['update'];
				}

				const channel = await interaction.guild.channels.fetch(value).catch(() => {
					logger.warn(`Failed to fetch channel ${value} from guild ${interaction.guild?.id}`);
					return undefined;
				});
				if (!channel) {
					return Promise.reject('Unable to find selected channel!');
				}
				await checkChannelPermissions(channel, ['ViewChannel', 'SendMessages']);
				dbGuild.notificationChannelId = interaction.values[0];
				await NotificationHandler.sendNotification(
					dbGuild,
					'Notifications',
					'This channel will now receive notifications and dev updates!',
					{ color: Colors.Green }
				);
				return ['saveGuild', 'update', 'updateWidget'];
				break;
			default:
				return Promise.reject('Missing Options ID on Interaction. This should never happen');
		}
	}
}
