/* eslint-disable max-lines */
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonInteraction, ButtonStyle, CacheType, Client, CommandInteraction, ComponentType, DiscordAPIError, Embed, EmbedBuilder, Guild,
    InteractionCollector,
    Message, PartialMessage, TextBasedChannel, TextChannel, VoiceBasedChannel
} from 'discord.js';
import { setTimeout } from 'timers/promises';
import logger from '../../lib/logger';
import audioManager from '../util/audioManager';
import textManager from '../util/textManager';
import { EXCLAMATION_ICON_LINK, WARTIMER_ICON_LINK, WARTIMER_INTERACTION_ID, WARTIMER_INTERACTION_SPLIT } from './constant';
import { EInteractionType } from './types/interactionType';
import { DBGuild } from './types/dbGuild';
import Database from '../db/database';
import { SettingsHandler } from '../handlers/settingsHandler';
import { ECollectorStopReason } from './types/collectorStopReason';
import { userHasRole } from '../util/permissions';

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

    public static async loadExisting(
        client: Client
    ): Promise<void> {
        // Initialize existing widgets on startup
        Database.queryGuilds({
            'widget.messageId': { $exists: true }
        }).then(async (dbGuilds) => {
            const clientGuilds = await client.guilds.fetch();
            for (const dbGuild of dbGuilds) {
                const clientGuild = await clientGuilds.find((clientGuild) => clientGuild.id === dbGuild.id)?.fetch().catch(() => undefined);
                const widget = await Widget.find({
                    guild: clientGuild,
                    channelId: dbGuild.widget.channelId,
                    messageId: dbGuild.widget.messageId,
                    dbGuild
                });
                await widget?.update({ force: true });
                widget?.startListening();
            }
        }).catch(logger.error);
    }
    public static async create(
        interaction: CommandInteraction<CacheType>,
        guild: Guild,
        channel: TextBasedChannel
    ): Promise<unknown> {
        // checks if guild exists in db, creates document if not
        const dbGuild = await Database.getGuild(guild);



        return guild.members.fetch(interaction.user)
            .then((member) => {
                if (
                    !(member.user.id === process.env['OWNER_ID']) &&
                    !member.permissions.has('Administrator') &&
                    !member.roles.cache.some((role) => dbGuild.editorRoleIDs.includes(role.id))
                ) {
                    return Promise.reject('You must have editor permissions to use this command! Ask an administrator or editor to adjust the bot `/settings`');
                }
            })
            .then(() => {
                if (dbGuild.widget.channelId && dbGuild.widget.messageId) {
                    return Widget.find({
                        guild,
                        messageId: dbGuild.widget.messageId,
                        channelId: dbGuild.widget.channelId
                    }).then((widget) =>
                        widget?.message.delete()
                    ).catch(logger.error);
                }
            })
            .then(async () => channel.send({ embeds: [await Widget.getEmbed(guild)] }))
            .then(async (message) => {
                dbGuild.widget = {
                    channelId: message.channel.id,
                    messageId: message.id
                }
                await dbGuild.save();

                return new Promise((res) => {
                    new Widget(
                        message,
                        guild,
                        !dbGuild.hideWidgetButtons,
                        res);
                });
            })
            .catch((e) =>
                interaction.editReply({
                    content: (e as Error).message
                }))
            .catch(logger.error);
    }
    public static async find(options: {
        guild?: Guild;
        message?: Message<boolean>;
        messageId?: string;
        channelId?: string;
        dbGuild?: DBGuild;
    }): Promise<Widget | undefined> {
        let widget: Widget | undefined;
        // first check if widget can be found in memory
        if (options.messageId || options.message) {
            widget = Widget.LIST.find((widget) => widget.getId() === (options.message?.id ?? options.messageId))
            if (widget) return widget;
        }
        // if it's not in memory try to find the original message and load it into memory as a widget instance
        const message = await new Promise<Message<boolean> | PartialMessage | undefined>((res) => {
            if (options.message) {
                res(options.message);
            } else {
                options.channelId ?
                    res(options.guild?.channels.fetch(options.channelId)
                        .then((channel) => options.messageId && channel?.isTextBased?.() ?
                            channel.messages.fetch(options.messageId) :
                            undefined
                        )) :
                    res(undefined);
            }
        }).catch(() => undefined);

        if (!message || message.flags.has('Ephemeral')) return Promise.resolve(undefined);
        if (!message.guild) return Promise.reject('Unable to find to find required data on the Discord API response. Try again later.');
        const dbGuild = options.dbGuild ?? await Database.getGuild(message.guild);
        // if the clicked message doesn't equal the message stored in the db we try to find the message corresponding to the stored data and delete it
        if (dbGuild.widget.channelId && dbGuild.widget.messageId && (message.channel.id !== dbGuild.widget.channelId || message.id !== dbGuild.widget.messageId)) {
            // delete old message
            await message.guild.channels.fetch(dbGuild.widget.channelId)
                .then((channel) => {
                    if (channel?.isTextBased?.()) {
                        return channel.messages.fetch()
                            .then((messages) => messages.find((message) => message.id === dbGuild.widget.messageId))
                            .then((m) => m?.delete());
                    }
                }).catch(logger.error);
        }
        dbGuild.widget = {
            channelId: message.channel.id,
            messageId: message.id
        }
        await dbGuild.save();

        return new Promise((res) => {
            if (!message.guild) return Promise.reject('Unable to find to find required data on the Discord API response. Try again later.');
            new Widget(message, message.guild, !dbGuild.hideWidgetButtons, (widget) => res(widget));
        });
    }
    private static async getEmbed(guild: Guild, description?: string, title?: string): Promise<EmbedBuilder> {
        const embed = new EmbedBuilder();
        if (!description) {
            await Database.getGuild(guild)
                .then((dbGuild) => {
                    embed.setAuthor({ name: title ?? DEFAULT_TITLE, iconURL: WARTIMER_ICON_LINK })
                        .setFooter({
                            text: `Raidhelper Integration » ${dbGuild.raidHelper.apiKey ? 'Enabled' : 'Disabled'}` +
                                `\nNotifications » ${dbGuild.notificationChannelId?.match(/^[0-9]+$/) ? 'Enabled' : 'Disabled'}` +
                                `${dbGuild.assistantRoleIDs.length === 0 ? '\n\nMissing permission setup.\nEveryone can use the widget!' : ''}`
                        });

                    if (dbGuild.raidHelper.events.length > 0) {
                        const event = dbGuild.raidHelper.events.reduce((lowest, current) =>
                            Math.abs(current.startTime * 1000 - Date.now()) < Math.abs(lowest.startTime * 1000 - Date.now()) ? current : lowest);
                        return `On Standby for\n**${event.title}**\n*at* <t:${event.startTime}:t> *on* <t:${event.startTime}:d>`;
                    } else {
                        return '-'
                    }
                }).catch(() => '-').then((description) => embed.setDescription(description));
        } else {
            embed.setDescription(description);
            if (title) {
                embed.setAuthor({ name: title, iconURL: WARTIMER_ICON_LINK });
            }
        }
        return embed;
    }

    //endregion
    //region - Instance methods
    private async init(onReady: (widget: Widget) => void): Promise<void> {
        this.voiceState = this.message.guild ? audioManager.isConnected(this.message.guild.id) : false;
        return this.message.fetch().then((message) =>
            message.edit({
                components: this.showButtons ? [this.getButtons()] : [],
                embeds: [EmbedBuilder.from(this.message.embeds[0])]
            }).then((message) => {
                this.startListening();
                this.message = message;
                onReady(this);
            }));
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
    }): Promise<unknown> {
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

        const embed = await Widget.getEmbed(this.guild, options?.description, options?.title);

        return this.message.edit({
            components: this.showButtons ? [this.getButtons()] : [],
            embeds: [embed]
        }).then((res) => {
            this.isUpdating = 0;
            return res;
        }).catch((e: DiscordAPIError): unknown => {
            if (e.code === 429) {
                logger.error('Error: ' + e.message);
                this.rateLimitExceeded = true;
                return setTimeout((e.requestBody.json as { retry_after: number }).retry_after)
                    .then(() => this.rateLimitExceeded = false)
                    .catch(logger.error);
            }
        });
    }
    public startListening(): void {
        if (this.listener) {
            this.listener.stop(ECollectorStopReason.DISPOSE);
        }
        this.listener = this.message.createMessageComponentCollector({ componentType: ComponentType.Button })
            .on('collect', async (interaction) => {
                try {
                    const [, , interactionId] = interaction.customId.split(WARTIMER_INTERACTION_SPLIT);
                    if (!interaction.guild) {
                        await interaction.deferUpdate();
                        return;
                    }
                    const dbGuild = await Database.getGuild(interaction.guild);
                    const hasEditorPermission = await userHasRole(
                        interaction.guild!,
                        interaction.user,
                        dbGuild.editorRoleIDs
                    );
                    const hasAssistantPermission = await userHasRole(
                        interaction.guild!,
                        interaction.user,
                        dbGuild.assistantRoleIDs
                    );
                    switch (interactionId) {
                        case EWidgetButtonID.TEXT:
                            if (hasAssistantPermission || hasEditorPermission || dbGuild.assistantRoleIDs.length === 0) {
                                await this.toggleText({
                                    dbGuild
                                });
                            } else return Promise.reject('You do not have permission to use this.');
                            break;
                        case EWidgetButtonID.VOICE:
                            if (hasAssistantPermission || hasEditorPermission || dbGuild.assistantRoleIDs.length === 0) {
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
                                        .setURL('https://discord.gg/AzHDPVrBfn')
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
                } catch (e) {
                    interaction.reply({ ephemeral: true, content: e?.toString?.() || 'Unknown Error' })
                        .then(() => setTimeout(3000))
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
    public async setButtonsDisplay(state: boolean): Promise<unknown> {
        this.showButtons = state;
        if (!this.textState) {
            return this.update({ force: true });
        } else return;
    }
    //endregion
    //region - Callbacks
    private async onTextUnsubscribe(): Promise<unknown> {
        this.textState = false;
        return this.update({ force: true });
    }
    public async onAudioUnsubscribe(): Promise<unknown> {
        this.voiceState = false;
        if (!this.textState) {
            return this.update({ force: true });
        }
    }
    //endregion
    //region - Utility
    private getCustomId(buttonId: string): string {
        return [WARTIMER_INTERACTION_ID, EInteractionType.WIDGET, buttonId].join(WARTIMER_INTERACTION_SPLIT);
    }
    private getButtons(disableToggle = false, disableVoice = false): ActionRowBuilder<ButtonBuilder> {
        return new ActionRowBuilder<ButtonBuilder>()
            .addComponents(new ButtonBuilder()
                .setCustomId(this.getCustomId(EWidgetButtonID.TEXT))
                .setLabel(this.textState ? '■' : '▶')
                .setStyle(this.textState ? ButtonStyle.Danger : ButtonStyle.Success)
                .setDisabled(disableToggle))
            .addComponents(new ButtonBuilder()
                .setCustomId(this.getCustomId(EWidgetButtonID.VOICE))
                .setLabel(this.voiceState ? '🔇' : '🔊')
                .setStyle(this.voiceState ? ButtonStyle.Danger : ButtonStyle.Success)
                .setDisabled(disableVoice))
            .addComponents(new ButtonBuilder()
                .setCustomId(this.getCustomId(EWidgetButtonID.SETTINGS))
                .setLabel('⚙️')
                .setStyle(ButtonStyle.Primary))
            .addComponents(new ButtonBuilder()
                .setCustomId(this.getCustomId(EWidgetButtonID.INFO))
                .setLabel('ℹ️')
                .setStyle(ButtonStyle.Secondary));
    }
    public getId(): string {
        return this.message.id;
    }
    public async recreateMessage(manual = false): Promise<unknown> {
        this.isResetting = true;
        return this.message.delete()
            .finally(() => (this.message.channel as TextChannel).send({
                components: [this.getButtons(true, true)],
                embeds: [EmbedBuilder.from(this.message.embeds[0])
                    .setTitle(manual ? 'Reloading Widget' : 'Discord API Timeout')
                    .setFooter({ text: 'Wartimer' })
                    .setDescription(manual ? 'Resetting..' :
                        `Resetting.. (${resetDurationSeconds}s)
                        This only affects the widget.\nAudio announcements still work.`)]
            }).then(async (message) => {
                const dbGuild = await Database.getGuild(message.guild);
                dbGuild.widget = {
                    channelId: message.channel.id,
                    messageId: message.id
                }
                await dbGuild.save();

                if (this.textState) {
                    textManager.subscribe({
                        guildId: message.guild.id,
                        msgId: message.id,
                        customTimings: dbGuild.customTimings
                    },
                        this.update.bind(this),
                        () => { },
                        this.onTextUnsubscribe.bind(this)
                    );
                }

                this.message = message;
                this.startListening();

                return setTimeout(manual ? 0 : resetDurationSeconds * 1000)
                    .then(() => {
                        this.isUpdating = 0;
                        this.isResetting = false
                        if (!this.textState) {
                            return this.update({ force: true });
                        }
                    }).catch(logger.error);
            })
            ).catch(logger.error);
    }
    //endregion
    //region - External action
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
                    res,
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
    }): Promise<unknown> {
        if (options.interaction) {
            if (this.voiceState) {
                return audioManager.disconnect(this.guild, options.dbGuild);
            } else {
                const channel = (await options.interaction.guild?.members.fetch(options.interaction.user).catch(() => undefined))?.voice.channel ?? undefined;
                if (!channel) {
                    return Promise.reject('You are not in a voice channel!');
                }
                return audioManager.connect(
                    channel,
                    options.dbGuild
                ).then(() => {
                    this.voiceState = true;
                    if (!this.textState) {
                        return this.update({ force: true });
                    }
                });
            }
        } else if (options.channel) {
            return audioManager.connect(
                options.channel,
                options.dbGuild
            ).then(() => {
                this.voiceState = true;
                if (!this.textState) {
                    return this.update();
                }
            });
        } else {
            return audioManager.disconnect(this.guild, options.dbGuild);
        }
    }
    //endregion
}