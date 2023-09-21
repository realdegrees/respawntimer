/* eslint-disable max-lines */
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonComponentData,
    ButtonInteraction, ButtonStyle, CacheType, Client, CommandInteraction, ComponentType, DiscordAPIError, Embed, EmbedBuilder, Guild,
    GuildTextBasedChannel,
    InteractionCollector,
    Message, PartialMessage, TextBasedChannel, TextChannel, VoiceBasedChannel
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

    private _textState = false;
    private _voiceState = false;
    private _isResetting = false;
    private _rateLimitExceeded = false;

    //region - getters
    public get textState(): boolean {
        return this._textState;
    }
    public get voiceState(): boolean {
        return this._voiceState;
    }
    public get isResetting(): boolean {
        return this._isResetting;
    }
    public get rateLimitExceeded(): boolean {
        return this._rateLimitExceeded;
    }
    //endregion
    //region - setters
    private set textState(value) {
        this._textState = value;
    }
    private set voiceState(value) {
        this._voiceState = value;
    }
    private set isResetting(value) {
        this._isResetting = value;
    }
    private set rateLimitExceeded(value) {
        this._rateLimitExceeded = value;
    }
    //endregion

    private listener: InteractionCollector<ButtonInteraction> | undefined;

    private isUpdating = 0;

    /**
     * @param interaction The interaction that created this widget
     * @param message The message that this widget should live in
     * @param guild The guild where the interaction was executed
     * @param managerRole The role that was specified in the command
     */
    public constructor(
        private message: Message | PartialMessage,
        private guild: Guild,
        private showButtons: boolean,
        onReady: (widget: Widget) => void
    ) {
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
                widget?.startListening();
            } catch (e) {
                logger.error(`[${dbGuild.name}] Error while trying to initialize widget: ${e?.toString?.() || 'Unknown'}`);
                continue;
            }
        }
    }
    /**
     * Creates a new widget and deletes the exisitng one
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
        dbGuild.widget = {
            channelId: message.channel.id,
            messageId: message.id,
        };
        await dbGuild.save();

        await new Promise<Widget>((res) => {
            new Widget(
                message,
                guild,
                !dbGuild.hideWidgetButtons,
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

            if (!message || message.flags.has('Ephemeral')) return Promise.resolve(undefined);
            if (!message.guild) return Promise.reject('Not a guild message');

            const dbGuild = dbGuildArg ?? await Database.getGuild(message.guild);

            // if the clicked message doesn't equal the message stored in the db we try to find the message corresponding to the stored data and delete it
            const argMessageIsNotDbMessage = dbGuild.widget.channelId && dbGuild.widget.messageId && (message.channel.id !== dbGuild.widget.channelId || message.id !== dbGuild.widget.messageId);
            if (argMessageIsNotDbMessage) {
                await this.deleteDbWidgetMessage(guild, messageId, channelId);
            }
            dbGuild.widget = {
                channelId: message.channel.id,
                messageId: message.id
            }
            await dbGuild.save();

            return new Promise((res) => {
                new Widget(message, guild, !dbGuild.hideWidgetButtons, (widget) => res(widget));
            });
        }
        catch (error) {
            logger.debug('Unable to find widget ' + error?.toString?.());
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
                const apiKeyStatus = dbGuild.raidHelper.apiKeyValid ? 'Enabled' : 'Disabled';
                const notificationsStatus = dbGuild.notificationChannelId?.match(/^[0-9]+$/) ? 'Enabled' : 'Disabled';

                embed.setFooter({
                    text: `Raidhelper Integration » ${apiKeyStatus}\n` +
                        `Notifications » ${notificationsStatus}` +
                        `${dbGuild.assistantRoleIDs.length === 0 ? '\n\nMissing permission setup.\nEveryone can use the widget!' : ''}`,
                });

                if (dbGuild.raidHelper.events.length > 0) {
                    const event = dbGuild.raidHelper.events.reduce((lowest, current) =>
                        Math.abs(current.startTimeUnix * 1000 - Date.now()) < Math.abs(lowest.startTimeUnix * 1000 - Date.now()) ? current : lowest);

                    const eventDescription = `On Standby for\n**${event.title}**\n*at* <t:${event.startTimeUnix}:t> *on* <t:${event.startTimeUnix}:d>`;
                    embed.setDescription(eventDescription);
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

            this.isUpdating = 0;
            return Promise.resolve();
        } catch (e) {
            if (e instanceof DiscordAPIError && e.code === 429) {
                logger.error('Error: ' + e.message);

                const retryAfter = (e.requestBody.json as { retry_after?: number })?.retry_after ?? 500;
                this.rateLimitExceeded = true;
                await setTimeout(retryAfter);
                this.rateLimitExceeded = false;
                return Promise.resolve();
            } else {
                // Handle other errors or log them as needed
                logger.error('Update error: ' + e?.toString?.() || 'Unknown');
            }
        }
    }
    public startListening(): void {
        if (this.listener) {
            this.listener.stop(ECollectorStopReason.DISPOSE);
        }
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
                            if(this.isResetting){
                                return Promise.reject('Widget is currently resetting! Please wait.');
                            }
                            hasPermission = hasAssistantPermission || hasEditorPermission || dbGuild.assistantRoleIDs.length === 0;
                            if (hasPermission) {
                                await this.toggleText({
                                    dbGuild
                                });
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
                        case EWidgetButtonID.INFO:
                            await interaction.reply({
                                ephemeral: true,
                                embeds: [
                                    new EmbedBuilder()
                                        .setAuthor({ iconURL: WARTIMER_ICON_LINK, name: 'Wartimer' })
                                        .setThumbnail('https://assets-global.website-files.com/6257adef93867e50d84d30e2/636e0a6a49cf127bf92de1e2_icon_clyde_blurple_RGB.png')
                                        .setTitle('Discord')
                                        .setURL('https://discord.gg/tcvd8CsA4N')
                                        .setDescription('Join the discord to get assistance, discuss the bot or suggest new features'),
                                    new EmbedBuilder()
                                        .setAuthor({ iconURL: WARTIMER_ICON_LINK, name: 'Wartimer' })
                                        .setThumbnail('https://cdn.pixabay.com/photo/2022/01/30/13/33/github-6980894_1280.png')
                                        .setFooter({
                                            text: 'If the bot is offline please contact dennisgrees on discord',
                                            iconURL: EXCLAMATION_ICON_LINK
                                        })
                                        .setTitle('Github')
                                        .setURL('https://github.com/realdegrees/wartimer')
                                        // eslint-disable-next-line max-len
                                        .setDescription('If you require assistance with the bot or have suggestions for improvements feel free to open an issue on the github repo linked above.')
                                ]
                            });
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
    private async onTextUnsubscribe(): Promise<void> {
        this.textState = false;
        await this.update({ force: true });
    }
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
            label: this.textState ? '■' : '▶',
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
        }, {
            id: EWidgetButtonID.INFO,
            label: 'ℹ️',
            style: ButtonStyle.Secondary,
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
        try {
            this.isResetting = true;

            // Delete the existing message
            await this.message.delete();

            // Create a new message with components and an embed
            const newMessage = await (this.message.channel as TextChannel).send({
                components: [this.getButtons(true, true)],
                embeds: [
                    EmbedBuilder.from(this.message.embeds[0])
                        .setTitle('Discord API Timeout')
                        .setFooter({ text: 'Wartimer' })
                        .setDescription(`Resetting.. (${resetDurationSeconds}s) This only affects the widget.\nAudio announcements still work.`),
                ],
            });
            // Update the database with new message information
            const dbGuild = await Database.getGuild(newMessage.guild);
            dbGuild.widget = {
                channelId: newMessage.channel.id,
                messageId: newMessage.id,
            };
            await dbGuild.save();

            // Subscribe to text updates if needed
            if (this.textState) {
                textManager.subscribe(
                    {
                        guildId: newMessage.guild.id,
                        msgId: newMessage.id,
                        customTimings: dbGuild.customTimings,
                    },
                    this.update.bind(this),
                    () => { },
                    this.onTextUnsubscribe.bind(this)
                );
            }

            this.message = newMessage;
            this.startListening();

            // Delay before further actions (setTimeout returns a Promise)
            await setTimeout(resetDurationSeconds * 1000);

            // Reset flags and perform additional actions if needed
            this.isUpdating = 0;
            this.isResetting = false;

            if (!this.textState) {
                await this.update({ force: true });
            }
        } catch (e) {
            // Handle and log any errors that occur
            if (e instanceof DiscordAPIError && e.code === 429) {
                logger.error('Error: ' + e.message);
                const retryAfter = (e.requestBody.json as { retry_after?: number })?.retry_after ?? 500;
                this.rateLimitExceeded = true;
                await setTimeout(retryAfter);
                this.rateLimitExceeded = false;
                this.recreateMessage();
            } else {
                // Handle other errors or log them as needed
                logger.error(e?.toString?.() || 'Error during message recreation');
            }
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
    public toggleText(options: {
        dbGuild: DBGuild;
        forceOn?: boolean;
    }): Promise<void> {
        return new Promise((res) => {
            if (!this.textState || options.forceOn) {
                if (this.textState) return; // already on
                this.textState = true;
                textManager.subscribe({
                    msgId: this.message.id,
                    guildId: this.guild.id,
                    customTimings: options.dbGuild.customTimings
                },
                    this.update.bind(this),
                    res, // pass resolve as callback resolves this promise only when the first update happens in textManager
                    this.onTextUnsubscribe.bind(this));
            } else {
                this.textState = false;
                textManager.unsubscribe(this.message.id);
                res();
            }
        });
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
                this.voiceState = true;
                await audioManager.connect(channel, options.dbGuild);
                if (!this.textState) {
                    await this.update({ force: true });
                }
            }
        } else if (options.channel) {
            this.voiceState = true;
            await audioManager.connect(options.channel, options.dbGuild);
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