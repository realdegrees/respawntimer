/* eslint-disable max-lines */
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonComponentData,
    ButtonInteraction, ButtonStyle, CacheType, Client, CommandInteraction, ComponentType, DiscordAPIError, DiscordjsErrorCodes, Embed, EmbedBuilder, EmbedField, Guild,
    GuildTextBasedChannel,
    InteractionCollector,
    Message, PartialMessage, RateLimitError, TextBasedChannel, TextChannel, VoiceBasedChannel
} from 'discord.js';
import { setTimeout } from 'timers/promises';
import logger from '../lib/logger';
import audioManager from './handlers/audioManager';
import textManager from './handlers/textManager';
import { EPHEMERAL_REPLY_DURATION_SHORT, EXCLAMATION_ICON_LINK, WARTIMER_ICON_LINK, WARTIMER_INTERACTION_ID, WARTIMER_INTERACTION_SPLIT } from './common/constant';
import { EInteractionType } from './common/types/interactionType';
import { DBGuild } from './common/types/dbGuild';
import Database from './db/database';
import { SettingsHandler } from './handlers/settingsHandler';
import { ECollectorStopReason } from './common/types/collectorStopReason';
import { userHasRole } from './util/permissions';

export enum EWidgetButtonID {
    TEXT = 'text',
    VOICE = 'voice',
    SETTINGS = 'settings',
    INFO = 'info'
}
const resetDurationSeconds = 3;
const DEFAULT_TITLE = 'Respawn Timer';

export class Widget {
    private static LIST: Widget[] = []; // in-memory widgets

    private textState = false;
    private voiceState = false;
    private isResetting = false;
    private rateLimitExceeded = false;

    public getTextState() { return this.textState; }
    public getResettingState() { return this.isResetting; }

    private listener: InteractionCollector<ButtonInteraction> | undefined;
    private showButtons: boolean;
    private onUpdateOnce: (() => void) | undefined;
    private isUpdating = 0;

    /**
     * @param interaction The interaction that created this widget
     * @param message The message that this widget should live in
     * @param guild The guild where the interaction was executed
     * @param managerRole The role that was specified in the command
     */
    public constructor(
        private message: Message | PartialMessage,
        public readonly guild: Guild,
        private dbGuild: DBGuild,
        onReady: (widget: Widget) => void
    ) {
        this.showButtons = !dbGuild.widget.hideButtons;
        Widget.LIST.push(this);
        this.init(onReady).catch(logger.error);
    }

    //region - Static Methods

    /**
     * Loads the existing widgets from all guilds into memory
     * @param client 
     * @throws {Error}
     */
    public static async loadExisting(
        client: Client
    ): Promise<void> {
        // load all guilds from db that have an existing widget
        const dbGuilds = await Database.queryGuilds({
            'widget.messageId': { $exists: true }
        });
        const clientGuilds = await client.guilds.fetch();
        for (const dbGuild of dbGuilds) {
            try {
                const clientGuild = await clientGuilds.find((clientGuild) => clientGuild.id === dbGuild.id)?.fetch().catch(() => undefined);
                if (!clientGuild) {
                    throw new Error('Unable to find guild while initializing widget')
                }
                const widget = await Widget.find(clientGuild, dbGuild.widget.messageId, dbGuild.widget.channelId, dbGuild);
                await widget?.update({ force: true });
                // widget?.startListening(); might not need this
            } catch (e) {
                logger.error(`[${dbGuild.name}] Error while trying to initialize widget: ${e?.toString?.() || 'Unknown'}`);
                continue;
            }
        }
    }
    /**
     * Creates a new widget and deletes the existing one
     * @param interaction The interaction the widget was created from (DO NOT DEFER OR REPLY THIS INTERACTION)
     * @param guild 
     * @param channel 
     * @throws {Error}
     */
    public static async create(
        interaction: CommandInteraction<CacheType>,
        channel: GuildTextBasedChannel
    ): Promise<void> {
        const guild = channel.guild;
        // Check if guild exists in the database, create document if not
        const dbGuild = await Database.getGuild(guild);

        // Check permissions of the user
        const member = await guild.members.fetch(interaction.user);
        if (
            !(member.user.id === process.env['OWNER_ID']) &&
            !member.permissions.has('Administrator') &&
            !member.roles.cache.some((role) => dbGuild.editorRoleIDs.includes(role.id))
        ) {
            throw new Error('You must have editor permissions to use this command! Ask an administrator or editor to adjust the bot `/settings`');
        }

        // Delete existing widget message if it exists
        if (dbGuild.widget.channelId && dbGuild.widget.messageId) {
            const widget = await Widget.find(guild, dbGuild.widget.messageId, dbGuild.widget.channelId);
            if (widget) {
                await widget.message.delete();
            }
        }

        // Create and send the new widget message
        const embed = await Widget.getEmbed(guild);
        const message = await channel.send({ embeds: [embed] });

        // Update dbGuild widget data
        dbGuild.widget.messageId = message.id
        dbGuild.widget.channelId = message.channel.id
        dbGuild.widget.hideButtons = false; // reset buttons when creating new widget
        await dbGuild.save();

        await new Promise<Widget>((res) => {
            new Widget(
                message,
                guild,
                dbGuild,
                res);
        });
    }

    public static async find(
        guild: Guild,
        messageId?: string,
        channelId?: string,
        dbGuildArg?: DBGuild
    ): Promise<Widget | undefined> {
        try {
            let widget: Widget | undefined;
            // first check if widget can be found in memory
            widget = Widget.LIST.find((widget) => widget.getId() === messageId)
            if (widget) return widget;

            // if it's not in memory try to find the original message and load it into memory as a widget instance
            const message = await this.findWidgetMessage(guild, messageId, channelId);

            if (!message || message.flags.has('Ephemeral')) throw new Error(undefined);
            if (!message.guild) throw new Error(undefined);

            const dbGuild = dbGuildArg ?? await Database.getGuild(message.guild);

            // if the clicked message doesn't equal the message stored in the db we try to find the message corresponding to the stored data and delete it
            const argMessageIsNotDbMessage = dbGuild.widget.channelId && dbGuild.widget.messageId && (message.channel.id !== dbGuild.widget.channelId || message.id !== dbGuild.widget.messageId);
            if (argMessageIsNotDbMessage) {
                await this.deleteDbWidgetMessage(guild, messageId, channelId);
            }
            dbGuild.widget.channelId = message.channel.id;
            dbGuild.widget.messageId = message.id;
            await dbGuild.save();

            return new Promise((res) => {
                new Widget(message, guild, dbGuild, (widget) => res(widget));
            });
        }
        catch (error) {
            return undefined;
        }
    }
    private static async findWidgetMessage(guild: Guild, messageId?: string, channelId?: string): Promise<Message<boolean> | undefined> {
        try {
            if (!channelId || !messageId) {
                return undefined;
            }
            const channel = await guild?.channels.fetch(channelId);
            if (channel?.isTextBased?.()) {
                return await channel.messages.fetch(messageId);
            }
            return undefined;
        } catch (error) {
            logger.debug('Message saved in DB not found ' + error?.toString?.());
            return undefined;
        }
    }
    private static async deleteDbWidgetMessage(guild: Guild, messageId?: string, channelId?: string): Promise<void> {
        try {
            if (!messageId || !channelId) return;
            // delete old message
            const channel = await guild.channels.fetch(channelId);
            if (channel?.isTextBased?.()) {
                const message = await channel.messages.fetch(messageId);
                await message.delete();
            }
        } catch (error) {
            logger.debug('Unable to delete old widget message ' + error?.toString?.());
        }
    }
    private static async getEmbed(guild: Guild, description?: string, title?: string): Promise<EmbedBuilder> {
        const embed = new EmbedBuilder()
            .setAuthor({ name: title ?? DEFAULT_TITLE, iconURL: WARTIMER_ICON_LINK });

        if (description) {
            embed.setDescription(description);
        } else {
            try {
                const dbGuild = await Database.getGuild(guild);
                const apiKeyStatus = dbGuild.raidHelper.apiKeyValid ?
                    'Enabled' :
                    dbGuild.raidHelper.apiKey ? 'Invalid Key' : 'Disabled';
                const notificationsStatus = dbGuild.notificationChannelId?.match(/^[0-9]+$/) ? 'Enabled' : 'Disabled';

                embed.setFooter({
                    text: `Raidhelper Integration » ${apiKeyStatus}` +
                        `${dbGuild.assistantRoleIDs.length === 0 ? '\n\nMissing permission setup.\nEveryone can use the widget!' : ''}`,
                });

                if (dbGuild.raidHelper.events.length > 0) {
                    const fields = await this.getEventDisplayFields(guild, dbGuild);
                    embed.setFields(fields);
                } else {
                    embed.setDescription('-');
                }
            } catch (error) {
                // Handle the error or log it as needed
                logger.error(error?.toString?.() || 'Error getting widget embed');
                embed.setDescription('-'); // Set a default description in case of error
            }
        }
        return embed;
    }
    private static async getEventDisplayFields(guild: Guild, dbGuild: DBGuild): Promise<EmbedField[]> {
        const event = dbGuild.raidHelper.events.reduce((lowest, current) =>
            Math.abs(current.startTimeUnix * 1000 - Date.now()) < Math.abs(lowest.startTimeUnix * 1000 - Date.now()) ? current : lowest);
        const startTimeStamp = new Date(Math.round(event.startTimeUnix / 60 / 30) * 30 * 60 * 1000).getTime() / 1000;
        const voiceChannel = (event.voiceChannelId ? await guild.channels.fetch(event.voiceChannelId).catch(() => undefined) : undefined) ??
            (dbGuild.raidHelper.defaultVoiceChannelId ? await guild.channels.fetch(dbGuild.raidHelper.defaultVoiceChannelId).catch(() => undefined) : undefined);

        const voiceChannelText = dbGuild.raidHelper.enabled ?
            `${voiceChannel ? `Joining ${voiceChannel} at <t:${startTimeStamp}:t>` : '⚠️ *No Default Voice Channel Set*'}` :
            '```fix\nAuto-Join Disabled```';

        const timeText = `<t:${event.startTimeUnix}:d>${event.startTimeUnix === startTimeStamp
            && voiceChannel
            && dbGuild.raidHelper.enabled ? '' : ` at <t:${event.startTimeUnix}:t>`}`;

        // Pad with empty fields to improve visual
        return [{
            name: ' ',
            value: ' '
        }, {
            name: 'Scheduled Event',
            value: `\`\`\`fix\n${event.title}\`\`\``
        }, {
            name: 'Voice',
            value: voiceChannelText
        }, {
            name: 'Date',
            value: timeText
        }, {
            name: ' ',
            value: ' '
        }] as EmbedField[];
    }

    //endregion
    //region - Instance methods
    private async init(onReady: (widget: Widget) => void): Promise<void> {
        try {
            this.voiceState = !!this.message.guild && audioManager.isConnected(this.message.guild.id);
            let message = await this.message.fetch();
            message = await message.edit({
                components: this.showButtons ? [this.getButtons()] : [],
                embeds: [EmbedBuilder.from(this.message.embeds[0])]
            });

            this.startListening();
            this.message = message;

            textManager.subscribe({
                widget: this,
                customTimings: this.dbGuild.customTimings
            }, this.update.bind(this));

            onReady(this);
        } catch (e) {
            logger.error(e?.toString?.() || 'Error initializing widget');
        }
    }
    public async delete(): Promise<void> {
        return this.message.delete()
            .then(() => { })
            .catch(() => { });
    }
    public async update(options?: {
        title?: string;
        description?: string;
        force?: boolean;
    }): Promise<void> {
        if (this.isResetting || this.rateLimitExceeded) {
            return Promise.resolve();
        }
        if (!options?.force && this.isUpdating > 0) {
            if (this.isUpdating >= 4) {
                return this.recreateMessage();
            } else {
                this.isUpdating++;
                return Promise.resolve();
            }
        }
        this.isUpdating++;

        try {
            const embed = await Widget.getEmbed(this.guild, options?.description, options?.title);
            await this.message.edit({
                components: this.showButtons ? [this.getButtons()] : [],
                embeds: [embed]
            });

            this.onUpdateOnce?.();
            this.onUpdateOnce = undefined;

            this.isUpdating = 0;
            return Promise.resolve();
        } catch (e) {
            if (e instanceof RateLimitError) {
                logger.debug('Hit rate limit while updating: ' + e.timeToReset);
                this.rateLimitExceeded = true;
                await setTimeout(e.timeToReset);
                this.rateLimitExceeded = false;
            } else if (!(e instanceof DiscordAPIError)) {
                // Handle other errors or log them as needed
                logger.error('Update error: ' + e?.toString?.() || 'Unknown');
            }
        }
    }
    private stopListening(): void {
        if (this.listener) {
            this.listener.stop(ECollectorStopReason.DISPOSE);
        }
    }
    public startListening(): void {
        this.stopListening();
        this.listener = this.message.createMessageComponentCollector({ componentType: ComponentType.Button })
            .on('collect', async (interaction) => {
                try {
                    const [, , interactionId] = interaction.customId.split(WARTIMER_INTERACTION_SPLIT);
                    logger.info(`[${this.message.guild?.name}] ${interactionId} interaction`);
                    if (!interaction.guild) {
                        await interaction.deferUpdate();
                        return;
                    }
                    const dbGuild = await Database.getGuild(interaction.guild);
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
                    let hasPermission;
                    switch (interactionId) {
                        case EWidgetButtonID.TEXT:
                            if (this.isResetting) {
                                return Promise.reject('Widget is currently resetting! Please wait.');
                            }
                            hasPermission = hasAssistantPermission || hasEditorPermission || dbGuild.assistantRoleIDs.length === 0;
                            if (hasPermission) {
                                await this.toggleText();
                            } else return Promise.reject('You do not have permission to use this.');
                            break;
                        case EWidgetButtonID.VOICE:
                            hasPermission = hasAssistantPermission || hasEditorPermission || dbGuild.assistantRoleIDs.length === 0;
                            if (hasPermission) {
                                await this.toggleVoice({
                                    dbGuild,
                                    interaction: interaction as ButtonInteraction
                                });
                            } else return Promise.reject('You do not have permission to use this.');
                            break;
                        case EWidgetButtonID.SETTINGS:
                            if (hasEditorPermission) {
                                await SettingsHandler.openSettings(interaction as ButtonInteraction);
                            } else return Promise.reject(dbGuild.editorRoleIDs.length === 0 ?
                                'Editor permissions have not been set up yet!\nPlease ask someone with administrator permissions to add editor roles in the settings.' :
                                'You do not have editor permissions.');
                            break;
                        default: return Promise.reject('Could not complete request');
                    }
                    await interaction.deferUpdate().catch(() => { });
                } catch (error) {
                    interaction.reply({ ephemeral: true, content: (error instanceof Error ? error.message : error?.toString?.()) || 'An error occurred' })
                        .then(() => setTimeout(EPHEMERAL_REPLY_DURATION_SHORT))
                        .then(() => interaction.deleteReply())
                        .catch(logger.error);
                }
            })
            .on('end', (interactions, reason) => {
                // Do nothing when manually stopped
                if (reason === ECollectorStopReason.DISPOSE) return;
                // Delete from memory when stopped because message was deleted
                const widgetIndex = Widget.LIST.findIndex((widget) => widget.getId() === this.getId());
                if (widgetIndex !== -1) {
                    const [widget] = Widget.LIST.splice(widgetIndex, 1);
                    textManager.unsubscribe(widget.getId(), true);
                }
            });
    }
    public async setButtonsDisplay(state: boolean): Promise<void> {
        this.showButtons = state;
        if (!this.textState) {
            await this.update({ force: true });
        }
    }
    //endregion
    //region - Callbacks
    public async onAudioUnsubscribe(): Promise<void> {
        this.voiceState = false;
        if (!this.textState) {
            await this.update({ force: true });
        }
    }
    //endregion
    //region - Utility
    private getCustomId(buttonId: string): string {
        return [WARTIMER_INTERACTION_ID, EInteractionType.WIDGET, buttonId].join(WARTIMER_INTERACTION_SPLIT);
    }
    private getButtons(disableToggle = false, disableVoice = false): ActionRowBuilder<ButtonBuilder> {
        const buttonConfigs: (Partial<Omit<ButtonComponentData, 'customId'>> & { id: string })[] = [{
            id: EWidgetButtonID.TEXT,
            label: this.textState ? '📝' : '📝',
            style: this.textState ? ButtonStyle.Danger : ButtonStyle.Success,
            disabled: disableToggle,
        }, {
            id: EWidgetButtonID.VOICE,
            label: this.voiceState ? '🔇' : '🔊',
            style: this.voiceState ? ButtonStyle.Danger : ButtonStyle.Success,
            disabled: disableVoice,
        }, {
            id: EWidgetButtonID.SETTINGS,
            label: '⚙️',
            style: ButtonStyle.Primary,
        }];

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
    public getId(): string {
        return this.message.id;
    }
    public async recreateMessage(): Promise<void> {
        this.isResetting = true;
        logger.info(`[${this.guild.name}] Recreating widget`);
        // Delete the existing message, unsubscribe the listener even inc ase the message couldn't be deleted
        await this.message.delete()
            .catch(() => {
                this.stopListening();
                logger.error('Unable to delete old widget on recreation!');
            });

        // Try to create a new message
        let newMessage;
        while (!newMessage) {
            try {
                // Create a new message with components and an embed
                newMessage = await (this.message.channel as TextChannel).send({
                    components: [this.getButtons(true, true)],
                    embeds: [
                        EmbedBuilder.from(this.message.embeds[0])
                            .setTitle('Discord API Timeout')
                            .setFooter({ text: 'Wartimer' })
                            .setDescription(`Resetting.. (${resetDurationSeconds}s) This only affects the widget.\nAudio announcements still work.`),
                    ],
                });
            } catch (e) {
                this.rateLimitExceeded = true;
                await setTimeout(e instanceof RateLimitError ? e.timeToReset : 500);
                this.rateLimitExceeded = false;
            }
        }

        // Update the database with new message information
        const dbGuild = await Database.getGuild(newMessage.guild);
        dbGuild.widget.channelId = newMessage.channel.id;
        dbGuild.widget.messageId = newMessage.id;
        await dbGuild.save();

        this.message = newMessage;
        this.startListening();

        // Delay before further actions (setTimeout returns a Promise)
        await setTimeout(resetDurationSeconds * 1000);

        // Reset flags and perform additional actions if needed
        this.isUpdating = 0;
        this.isResetting = false;

        if (!this.textState) {
            await this.update({ force: true })
                .catch(logger.error);
        }
    }
    //endregion
    //region - External action
    /**
     * 
     * @param options 
     * @returns 
     * @throws {Error}
     */
    public async toggleText(forceOn?: boolean): Promise<void> {
        return new Promise(async (res) => {
            if (!this.textState || forceOn) {
                this.textState = true;
                this.onUpdateOnce = res;
            } else {
                this.textState = false;
                this.onUpdateOnce = res;
                await setTimeout(1000);
                await this.update({ force: true });
            }
        })

    }
    public async toggleVoice(options: {
        dbGuild: DBGuild;
        interaction?: ButtonInteraction<CacheType>;
        channel?: VoiceBasedChannel;
    }): Promise<void> {
        if (options.interaction) {
            if (this.voiceState) {
                await audioManager.disconnect(this.guild, options.dbGuild);
            } else {
                const channel = options.channel ?? (await options.interaction.guild?.members.fetch(options.interaction.user).catch(() => undefined))?.voice.channel;
                if (!channel) {
                    throw new Error('You are not in a voice channel!');
                }
                await audioManager.connect(channel, options.dbGuild);
                this.voiceState = true;
                if (!this.textState) {
                    await this.update({ force: true });
                }
            }
        } else if (options.channel) {
            await audioManager.connect(options.channel, options.dbGuild);
            this.voiceState = true;
            if (!this.textState) {
                await this.update();
            }
        } else {
            await audioManager.disconnect(this.guild, options.dbGuild);
        }
        // Resolve the Promise
        return Promise.resolve();
    }
    //endregion
}