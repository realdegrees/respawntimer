/* eslint-disable max-lines */
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonComponentData,
	ButtonInteraction,
	ButtonStyle,
	CacheType,
	CommandInteraction,
	DiscordAPIError,
	EmbedBuilder,
	EmbedField,
	Message,
	MessageFlags,
	PermissionsBitField,
	TextChannel
} from 'discord.js';
import { setTimeout } from 'timers/promises';
import logger from '../lib/logger';
import audioManager from './handlers/audioManager';
import textManager from './handlers/textManager';
import {
	EPHEMERAL_REPLY_DURATION_SHORT,
	WARTIMER_ICON_LINK,
	WARTIMER_INTERACTION_ID,
	WARTIMER_INTERACTION_SPLIT
} from './common/constant';
import { EInteractionType } from './common/types/interactionType';
import { DBGuild } from './common/types/dbGuild';
import Database from './db/database';
import { SettingsHandler } from './handlers/settingsHandler';
import { checkChannelPermissions, userHasRole } from './util/permissions';
import { roundUpHalfHourUnix } from './util/formatTime';
import Bot from './bot';
import { getVoiceConnection } from '@discordjs/voice';
import { getEventVoiceChannel } from './util/discord';

//TODO: do this when widget tries to update and message is not found
/**
 if (reason === ECollectorStopReason.DISPOSE || this.isResetting) return;
        // Delete from memory when stopped because message was deleted
        const widgetIndex = Widget.LIST.findIndex(
          (widget) => widget.getId() === this.getId()
        );
        if (widgetIndex !== -1) {
          const [widget] = Widget.LIST.splice(widgetIndex, 1);
          textManager.unsubscribe(widget.getId(), true);
        }
 */

//TODO: see if Widget.LIST is even necessary

export enum EWidgetButtonID {
	TEXT = 'text',
	VOICE = 'voice',
	SETTINGS = 'settings',
	INFO = 'info'
}
const resetDurationSeconds = 3;
const DEFAULT_TITLE = 'Respawn Timer';
type GuildID = string;
export class Widget {
	private static memory: Record<GuildID, Widget> = {}; // in-memory widgets

	public textState = false;
	public voiceState = false;
	private isResetting = false;
	private isUpdating = false;
	private failedUpdateCount = 0;
	private showButtons: boolean = true;
	private onUpdateOnce: (() => void) | undefined;

	/**
	 * @param interaction The interaction that created this widget
	 * @param message The message that this widget should live in
	 * @param guild The guild where the interaction was executed
	 * @param managerRole The role that was specified in the command
	 */
	public constructor(public guildId: string, public messageId: string, public channelId: string) {
		Database.getGuild(guildId)
			.then((dbGuild) => {
				dbGuild.widget.hideButtons = false;
				this.voiceState = !!getVoiceConnection(guildId);
				this.update();
				return dbGuild.save();
			})
			.catch((e) => logger.error(e?.toString?.() || 'Error initializing widget'));
	}

	//region - Static Methods
	/**
	 * Creates a new widget and deletes the existing one
	 * @param interaction The interaction the widget was created from (DO NOT DEFER OR REPLY THIS INTERACTION)
	 * @param guild
	 * @param channel
	 * @throws {Error}
	 */
	public static async create(
		interaction: CommandInteraction<CacheType>,
		channel: TextChannel,
		dbGuild: DBGuild
	): Promise<void> {
		const guild = channel.guild;

		// Check permissions of the user
		const member = await guild.members.fetch(interaction.user);
		if (!member) throw new Error('Internal Error. User not found!');
		if (
			member.user.id !== process.env['OWNER_ID'] &&
			!member.permissions.has(PermissionsBitField.Flags.Administrator) &&
			!member.roles.cache.some((role) => dbGuild.editorRoleIDs.includes(role.id))
		) {
			throw new Error(
				'You must have editor permissions to use this command! Ask an administrator or editor to adjust the bot `/settings`'
			);
		}

		const existing = await Widget.find(dbGuild);
		await existing?.delete();

		// Create and send the new widget message
		const embed = await Widget.getEmbed(dbGuild.id);
		const message = await channel.send({ embeds: [embed] });

		// Update dbGuild widget data
		dbGuild.widget.messageId = message.id;
		dbGuild.widget.channelId = message.channel.id;
		dbGuild.widget.hideButtons = false; // reset buttons when creating new widget
		await dbGuild.save();

		const widget = new Widget(dbGuild.id, dbGuild.widget.messageId, dbGuild.widget.channelId);
		Widget.memory[dbGuild.id] = widget;
	}

	public static async find(dbGuild: DBGuild): Promise<Widget | undefined> {
		try {
			let widget: Widget | undefined;
			// first check if widget can be found in memory
			widget = Widget.memory[dbGuild.id];
			if (widget) {
				if (widget.messageId !== dbGuild.widget.messageId) {
					await widget.delete();
				} else {
					return widget;
				}
			}

			// if it's not in memory try to find the original message and load it into memory as a widget instance
			if (!dbGuild.widget.channelId || !dbGuild.widget.messageId) return;
			const guild = await Bot.client.guilds.fetch(dbGuild.id).catch(() => undefined);
			const channel = await guild?.channels.fetch(dbGuild.widget.channelId).catch(() => undefined);
			if (!channel?.isTextBased()) return;
			const message = await channel.messages.fetch(dbGuild.widget.messageId).catch(() => undefined);

			if (!message) {
				dbGuild.widget = {};
				await dbGuild.save();
				return;
			}

			widget = new Widget(dbGuild.id, dbGuild.widget.messageId, dbGuild.widget.channelId);
			Widget.memory[dbGuild.id] = widget;
			return widget;
		} catch (error) {
			logger.error(`[${dbGuild.name}] Error finding widget`, error);
			return undefined;
		}
	}

	private static async getEmbed(
		guildId: string,
		widget?: Widget,
		description?: string,
		title?: string
	): Promise<EmbedBuilder> {
		const embed = new EmbedBuilder().setAuthor({
			name: title ?? DEFAULT_TITLE,
			iconURL: WARTIMER_ICON_LINK
		});

		if (description) {
			embed.setDescription(description);
		} else {
			try {
				const dbGuild = await Database.getGuild(guildId);
				const apiKeyStatus = dbGuild.raidHelper.apiKeyValid
					? 'Enabled'
					: dbGuild.raidHelper.apiKey
					? '⚠️'
					: 'Disabled';

				embed.setFooter({
					text:
						`Raidhelper Integration » ${apiKeyStatus}` +
						`${
							dbGuild.assistantRoleIDs.length === 0
								? '\n\nMissing permission setup.\nEveryone can use the widget!'
								: ''
						}`
				});

				if (dbGuild.raidHelper.events.length > 0) {
					const fields = await this.getEventDisplayFields(dbGuild);
					embed.setFields(fields);
				} else {
					const channelId = widget
						? getVoiceConnection(widget.guildId)?.joinConfig.channelId
						: undefined;
					if (widget?.voiceState && channelId) {
						try {
							const channel = await (
								await Bot.client.guilds.fetch(widget.guildId)
							).channels.fetch(channelId);
							embed.setDescription(`in ${channel}`);
						} catch (e) {
							embed.setDescription('-');
						}
					} else {
						embed.setDescription('-');
					}
				}
			} catch (error) {
				// Handle the error or log it as needed
				logger.error(error?.toString?.() || 'Error getting widget embed');
				embed.setDescription('-'); // Set a default description in case of error
			}
		}
		return embed;
	}
	private static async getEventDisplayFields(dbGuild: DBGuild): Promise<EmbedField[]> {
		const event = dbGuild.raidHelper.events.reduce((lowest, current) =>
			Math.abs(current.startTimeUnix * 1000 - Date.now()) <
			Math.abs(lowest.startTimeUnix * 1000 - Date.now())
				? current
				: lowest
		);
		const startTimeStamp = roundUpHalfHourUnix(event.startTimeUnix);
		const voiceChannel = await getEventVoiceChannel(event, dbGuild.id).catch(() => null);
		const permissionText = voiceChannel
			? await checkChannelPermissions(voiceChannel, ['ViewChannel', 'Connect', 'Speak']).catch(
					(e) => String(e)
			  )
			: undefined;

		const channelInfo = voiceChannel
			? `${
					startTimeStamp <= Date.now() / 1000 ? 'Joined' : 'Joining'
			  } ${voiceChannel} at <t:${startTimeStamp}:t>`
			: '⚠️ *No Default Voice Channel Set*';

		const voiceChannelText = dbGuild.raidHelper.enabled
			? `${permissionText ?? channelInfo}`
			: '```fix\nAuto-Join Disabled```';

		const timeText = `<t:${event.startTimeUnix}:d>${
			event.startTimeUnix === startTimeStamp && voiceChannel && dbGuild.raidHelper.enabled
				? ''
				: ` at <t:${event.startTimeUnix}:t>`
		}`;

		// Pad with empty fields to improve visual
		return [
			{
				name: ' ',
				value: ' '
			},
			{
				name: 'Scheduled Event',
				value: `\`\`\`fix\n${event.title}\`\`\``
			},
			{
				name: 'Scheduled Time',
				value: timeText
			},
			{
				name: 'Voice',
				value: voiceChannelText
			},
			{
				name: ' ',
				value: ' '
			}
		] as EmbedField[];
	}

	//endregion
	//region - Instance methods
	public async delete(): Promise<void> {
		const guild = await Bot.client.guilds.fetch(this.guildId).catch(() => undefined);
		const channel = this.channelId
			? await guild?.channels.fetch(this.channelId).catch(() => undefined)
			: undefined;
		const message =
			this.messageId && channel?.isTextBased()
				? await channel.messages.fetch(this.messageId).catch(() => undefined)
				: undefined;

		if (!message) return;

		textManager.unsubscribe(this.guildId);

		return message
			.delete()
			.then(() => {})
			.catch(() => {});
	}
	public async update(options?: {
		title?: string;
		description?: string;
		force?: boolean;
	}): Promise<void> {
		if (this.isResetting) {
			return Promise.resolve();
		}
		if (this.isUpdating) {
			this.failedUpdateCount++;
			if (!options?.force) {
				if (this.failedUpdateCount >= 4) {
					await this.recreateMessage();
				}
				return Promise.resolve();
			}
		}
		this.isUpdating = true;
		try {
			const embed = await Widget.getEmbed(this.guildId, this, options?.description, options?.title);

			try {
				const guild = await Bot.client.guilds.fetch(this.guildId).catch(() => undefined);
				const channel = this.channelId
					? await guild?.channels.fetch(this.channelId).catch(() => undefined)
					: undefined;
				const message =
					this.messageId && channel?.isTextBased()
						? await channel.messages.fetch(this.messageId).catch(() => undefined)
						: undefined;

				if (!message) {
					const dbGuild = await Database.getGuild(this.guildId);
					dbGuild.widget = {};
					await dbGuild.save();
					textManager.unsubscribe(this.guildId);
					delete Widget.memory[this.guildId];
					logger.info(`[${dbGuild.name}] Unable to find widget message. Cleaning up references.`);
					return;
				}

				await message
					?.edit({
						components: this.showButtons ? [this.getButtons()] : [],
						embeds: [embed]
					})
					.catch(() => undefined);

				this.onUpdateOnce?.();
				this.onUpdateOnce = undefined;

				this.isUpdating = false;
				this.failedUpdateCount = 0;
				return Promise.resolve();
			} catch (e) {
				logger.error(JSON.stringify(e));
			}
		} catch (e) {
			this.isUpdating = false;
			if (!(e instanceof DiscordAPIError)) {
				const { name } = await Database.getGuild(this.guildId);
				// Handle other errors or log them as needed
				logger.error(`[${name}] Widget update Error: ${e?.toString?.() || 'Unknown'}`);
			}
		}
	}

	public async handleInteraction(interaction: ButtonInteraction): Promise<void> {
		try {
			const [, , interactionId] = interaction.customId.split(WARTIMER_INTERACTION_SPLIT);
			if (!interaction.guild) {
				await interaction.deferUpdate();
				return;
			}
			const dbGuild = await Database.getGuild(this.guildId);

			logger.debug(`[${dbGuild.name}] ${interactionId} interaction`);

			const hasEditorPermission = await userHasRole(
				interaction.guild,
				interaction.user,
				dbGuild.editorRoleIDs
			);
			const hasAssistantPermission = await userHasRole(
				interaction.guild,
				interaction.user,
				dbGuild.assistantRoleIDs
			);

			const hasButtonPermission =
				hasAssistantPermission ||
				hasEditorPermission ||
				(dbGuild.assistantRoleIDs.length === 0 && dbGuild.editorRoleIDs.length === 0);

			if (!hasButtonPermission) throw new Error('You do not have permission to use this.');
			switch (interactionId) {
				case EWidgetButtonID.TEXT:
					if (this.textState) {
						await textManager.unsubscribe(this.guildId, 'Manual');
					} else {
						await textManager.subscribe(this.guildId);
					}
					break;
				case EWidgetButtonID.VOICE:
					if (this.voiceState) {
						await audioManager.unsubscribe(this.guildId, 'Manual');
					} else {
						const channel = await interaction.guild?.members
							.fetch(interaction.user)
							.then((member) => member.voice.channel)
							.catch(() => undefined);

						if (!channel) {
							throw new Error('You are not in a voice channel!');
						}
						await audioManager.subscribe(this.guildId, channel);
					}
					break;
				case EWidgetButtonID.SETTINGS:
					if (hasEditorPermission) {
						await SettingsHandler.openSettings(interaction as ButtonInteraction);
					} else
						throw new Error(
							dbGuild.editorRoleIDs.length === 0
								? 'Editor permissions have not been set up yet!\nPlease ask someone with administrator permissions to add editor roles in the settings.'
								: 'You do not have editor permissions.'
						);
					break;
				default:
					throw new Error('Could not complete request');
			}
			await interaction.deferUpdate().catch(() => {});
		} catch (error) {
			interaction
				.reply({
					ephemeral: true,
					content:
						(error instanceof Error ? error.message : error?.toString?.()) || 'An error occurred'
				})
				.then(() => setTimeout(EPHEMERAL_REPLY_DURATION_SHORT))
				.then(() => interaction.deleteReply())
				.catch(logger.error);
		}
	}
	public async setButtonsDisplay(state: boolean): Promise<void> {
		this.showButtons = state;
		if (!this.textState) {
			await this.update({ force: true });
		}
	}
	//endregion
	//region - Utility
	private getCustomId(buttonId: string): string {
		return [WARTIMER_INTERACTION_ID, EInteractionType.WIDGET, buttonId].join(
			WARTIMER_INTERACTION_SPLIT
		);
	}
	private getButtons(disableToggle = false, disableVoice = false): ActionRowBuilder<ButtonBuilder> {
		const buttonConfigs: (Partial<Omit<ButtonComponentData, 'customId'>> & {
			id: string;
		})[] = [
			{
				id: EWidgetButtonID.TEXT,
				label: this.textState ? '📝' : '📝',
				style: this.textState ? ButtonStyle.Danger : ButtonStyle.Success,
				disabled: disableToggle
			},
			{
				id: EWidgetButtonID.VOICE,
				label: this.voiceState ? '🔇' : '🔊',
				style: this.voiceState ? ButtonStyle.Danger : ButtonStyle.Success,
				disabled: disableVoice
			},
			{
				id: EWidgetButtonID.SETTINGS,
				label: '⚙️',
				style: ButtonStyle.Primary
			}
		];

		const actionRow = new ActionRowBuilder<ButtonBuilder>();
		for (const config of buttonConfigs) {
			actionRow.addComponents(
				new ButtonBuilder()
					.setCustomId(this.getCustomId(config.id))
					.setLabel(config.label || '<Missing>')
					.setStyle(config.style || ButtonStyle.Primary)
					.setDisabled(config.disabled || false) // Ensure the value is boolean
			);
		}
		return actionRow;
	}

	public async recreateMessage(): Promise<void> {
		this.isResetting = true;
		const dbGuild = await Database.getGuild(this.guildId);
		logger.info(`[${dbGuild.name}] Recreating widget`);

		const guild = await Bot.client.guilds.fetch(this.guildId).catch(() => undefined);
		const channel = this.channelId
			? await guild?.channels.fetch(this.channelId).catch(() => undefined)
			: undefined;
		const message =
			this.messageId && channel?.isTextBased()
				? await channel.messages.fetch(this.messageId).catch(() => undefined)
				: undefined;

		if (message?.deletable) {
			// Delete the existing message, unsubscribe the listener even inc ase the message couldn't be deleted
			await message.delete().catch(() => {
				logger.error(`[${dbGuild.name}] Failed to delete message while reloading widget`);
			});
		} else {
			logger.error(`[${dbGuild.name}] Unable to find old message while reloading widget`);
		}

		if (!channel || !channel.isTextBased()) {
			logger.error(`[${dbGuild.name}] Channel invalid while reloading widget`);
			return;
		}
		// Try to create a new message
		let newMessage: Message<true> | undefined;
		while (!newMessage) {
			// Create a new message with components and an embed
			newMessage = await channel
				.send({
					components: [this.getButtons(true, false)],
					embeds: [
						EmbedBuilder.from(await Widget.getEmbed(this.guildId, this))
							.setTitle('Discord API Timeout')
							.setFooter({ text: 'Wartimer' })
							.setDescription(
								`Resetting.. (${resetDurationSeconds}s) This only affects the widget.\nAudio announcements still work.`
							)
							.setFields()
					],
					flags: [MessageFlags.SuppressNotifications]
				})
				.catch(() => setTimeout(500).then(() => undefined));
		}
		this.channelId = newMessage.channel.id;
		this.messageId = newMessage.id;

		// Update the database with new message information
		dbGuild.widget.channelId = this.channelId;
		dbGuild.widget.messageId = this.messageId;
		await dbGuild.save();

		// Delay before further actions (setTimeout returns a Promise)
		await setTimeout(resetDurationSeconds * 1000);

		// Reset flags and perform additional actions if needed
		this.isUpdating = false;
		this.isResetting = false;
		this.failedUpdateCount = 0;

		if (!this.textState) {
			await this.update({ force: true }).catch(logger.error);
		}
	}
}
