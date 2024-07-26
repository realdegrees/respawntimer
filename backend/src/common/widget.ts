/* eslint-disable max-lines */
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonInteraction, ButtonStyle, CacheType, CommandInteraction, DiscordAPIError, Embed, EmbedBuilder, Guild,
    Message, PartialMessage, TextBasedChannel, TextChannel, VoiceBasedChannel
} from 'discord.js';
import { setTimeout } from 'timers/promises';
import logger from '../../lib/logger';
import audioManager from '../util/audioManager';
import textManager from '../util/textManager';
import { WARTIMER_ICON_LINK, WARTIMER_INTERACTION_ID, WARTIMER_INTERACTION_SPLIT } from './constant';
import { EInteractionType } from './types/interactionType';
import { DBGuild } from './types/dbGuild';
import { WidgetHandler } from '../widgetHandler';
import Database from '../db/database';

export const widgetButtonIds = {
    text: 'text',
    voice: 'voice',
    settings: 'settings',
    info: 'info'
};
const resetDurationSeconds = 3;
const DEFAULT_TITLE = 'Respawn Timer';

export class Widget {
    private _textState = false;
    public get textState(): boolean {
        return this._textState;
    }
    private set textState(value) {
        this._textState = value;
    }

    private _voiceState = false;
    public get voiceState(): boolean {
        return this._voiceState;
    }
    private set voiceState(value) {
        this._voiceState = value;
    }

    private _isResetting = false;
    public get isResetting(): boolean {
        return this._isResetting;
    }
    private set isResetting(value) {
        this._isResetting = value;
    }

    private _rateLimitExceeded = false;
    public get rateLimitExceeded(): boolean {
        return this._rateLimitExceeded;
    }
    private set rateLimitExceeded(value) {
        this._rateLimitExceeded = value;
    }

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
        WidgetHandler.WIDGETS.push(this);
        this.init(onReady).catch(logger.error);
    }
    public static async get(options: {
        guild?: Guild;
        message?: Message<boolean>;
        messageId?: string;
        channelId?: string;
    }): Promise<Widget | undefined> {
        return new Promise<Message<boolean> | PartialMessage | undefined>((res) => {
            if (options.message) {
                res(options.message);
            } else {
                options.channelId ?
                    res(options.guild?.channels.fetch(options.channelId)
                        .then((channel) => {
                            return options.messageId && channel?.isTextBased?.() ?
                                channel.messages.fetch(options.messageId).catch(() => undefined) :
                                undefined;
                        })) :
                    res(undefined);
            }
        }).then(async (message) => {
            if (!message || message.flags.has('Ephemeral')) return Promise.resolve(undefined);
            if (!message.guild) return Promise.reject('Unable to find to find required data on the Discord API response. Try again later.');
            const dbGuild = await Database.getGuild(message.guild);
            // if the clicked message doesn't equal the message stored in the db we try to find the message corresponding to the stored data and delete it
            if (dbGuild.widget.channelId && dbGuild.widget.messageId && (message.channel.id !== dbGuild.widget.channelId || message.id !== dbGuild.widget.messageId)) {
                // delete old message
                await message.guild.channels.fetch(dbGuild.widget.channelId)
                    .then((channel) => {
                        if (channel?.isTextBased?.()) {
                            return channel.messages.fetch().then((messages) => messages.find((message_1) => message_1.id === dbGuild.widget.messageId)).then((m) => m?.delete());
                        }
                    }).catch(logger.error);
            }
            dbGuild.widget = {
                channelId: message.channel.id,
                messageId: message.id
            }
            await dbGuild.save();
            const widget = WidgetHandler.WIDGETS.find((widget) => widget.getId() === message!.id);
            if (!widget) {
                return new Promise((res) => {
                    if (!message.guild) return Promise.reject('Unable to find to find required data on the Discord API response. Try again later.');
                    new Widget(message, message.guild, !dbGuild.hideWidgetButtons, (widget) => res(widget));
                });
            } else {
                return Promise.resolve(widget);
            }

        });
    }
    public async setButtonsDisplay(state: boolean): Promise<unknown> {
        this.showButtons = state;
        if (!this.textState) {
            return this.update({ force: true });
        } else return;
    }

    public static async create(
        interaction: CommandInteraction<CacheType>,
        guild: Guild,
        channel: TextBasedChannel
    ): Promise<unknown> {
        // checks if guild exists in db, creates document if not
        const dbGuild = await Database.getGuild(guild);

        if (dbGuild.widget) {
            await Widget.get({
                guild,
                messageId: dbGuild.widget.messageId,
                channelId: dbGuild.widget.channelId
            }).then((widget) =>
                widget?.message.delete()
            ).catch(logger.error);
        }

        return guild.members.fetch(interaction.user)
            .then((member) => {
                if (
                    !(member.user.id === process.env['OWNER_ID']) &&
                    !member.permissions.has('Administrator') &&
                    !member.roles.cache.some((role) => dbGuild.editorRoleIDs.includes(role.id))
                ) {
                    // eslint-disable-next-line max-len
                    return Promise.reject('You must have editor permissions to use this command! Ask an administrator or editor to adjust the bot `/settings`');
                }
            })
            .then(async () =>
                channel.send({
                    embeds: [await Widget.getEmbed(guild)]
                }).then((message) => {
                    dbGuild.widget = {
                        channelId: message.channel.id,
                        messageId: message.id
                    }
                    return dbGuild.save().then(() => new Promise((res) => {
                        new Widget(
                            message,
                            guild,
                            !dbGuild.hideWidgetButtons,
                            res);
                    }));
                }))
            .catch((e) =>
                interaction.editReply({
                    content: (e as Error).message
                }))
            .catch(logger.error);
    }
    private async init(onReady: (widget: Widget) => void): Promise<void> {
        this.voiceState = this.message.guild ? audioManager.isConnected(this.message.guild.id) : false;
        return this.message.fetch().then((message) =>
            message.edit({
                components: this.showButtons ? [this.getButtons()] : [],
                embeds: [EmbedBuilder.from(this.message.embeds[0])]
            }).then((message) => {
                this.message = message;
                onReady(this);
            }));
    }

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
    private getCustomId(buttonId: string): string {
        return [WARTIMER_INTERACTION_ID, EInteractionType.WIDGET, buttonId].join(WARTIMER_INTERACTION_SPLIT);
    }
    private getButtons(disableToggle = false, disableVoice = false): ActionRowBuilder<ButtonBuilder> {
        return new ActionRowBuilder<ButtonBuilder>()
            .addComponents(new ButtonBuilder()
                .setCustomId(this.getCustomId(widgetButtonIds.text))
                .setLabel(this.textState ? '■' : '▶')
                .setStyle(this.textState ? ButtonStyle.Danger : ButtonStyle.Success)
                .setDisabled(disableToggle))
            .addComponents(new ButtonBuilder()
                .setCustomId(this.getCustomId(widgetButtonIds.voice))
                .setLabel(this.voiceState ? '🔇' : '🔊')
                .setStyle(this.voiceState ? ButtonStyle.Danger : ButtonStyle.Success)
                .setDisabled(disableVoice))
            .addComponents(new ButtonBuilder()
                .setCustomId(this.getCustomId(widgetButtonIds.settings))
                .setLabel('⚙️')
                .setStyle(ButtonStyle.Primary))
            .addComponents(new ButtonBuilder()
                .setCustomId(this.getCustomId(widgetButtonIds.info))
                .setLabel('ℹ️')
                .setStyle(ButtonStyle.Secondary));
    }
    public getId(): string {
        return this.message.id;
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

    private static async getEmbed(guild: Guild, description?: string, title?: string): Promise<EmbedBuilder> {
        const embed = new EmbedBuilder();
        if (!description) {
            await Database.getGuild(guild)
                .then((dbGuild) => {
                    embed.setAuthor({ name: title ?? DEFAULT_TITLE, iconURL: WARTIMER_ICON_LINK })
                        .setFooter({
                            text: `Raidhelper Integration » ${dbGuild.raidHelper.apiKeyValid ? 'Enabled' : 'Disabled'}\n` +
                                `Notifications » ${dbGuild.notificationChannelId?.match(/^[0-9]+$/) ? 'Enabled' : 'Disabled'}`
                        });

                    if (dbGuild.raidHelper.events.length > 0) {
                        const event = dbGuild.raidHelper.events.reduce((lowest, current) =>
                            Math.abs(current.startTime * 1000 - Date.now()) < Math.abs(lowest.startTime * 1000 - Date.now()) ? current : lowest);
                        return `On Standby for **${event.title}**\n*at* <t:${event.startTime}:t> *on* <t:${event.startTime}:d>`;
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

    public async recreateMessage(manual = false): Promise<unknown> {
        this.isResetting = true;
        return this.message.delete().finally(() => {
            (this.message.channel as TextChannel).send({
                components: [this.getButtons(true, true)],
                embeds: [EmbedBuilder.from(this.message.embeds[0])
                    .setTitle(manual ? 'Reloading Widget' : 'Discord API Timeout')
                    .setFooter({ text: 'Wartimer' })
                    .setDescription(manual ? 'Resetting..' :
                        `Resetting.. (${resetDurationSeconds}s)
                        This only affects the widget.\nAudio announcements still work.`)]
            }).then(async (message) => {
                await Database.getGuild(message.guild).then((dbGuild) => {
                    dbGuild.widget = {
                        channelId: message.channel.id,
                        messageId: message.id
                    }
                    return dbGuild.save();
                }).catch(logger.error);

                textManager.updateSubscription(this.message.id, message.id);
                this.message = message;

                return setTimeout(manual ? 0 : resetDurationSeconds * 1000)
                    .then(() => {
                        this.isUpdating = 0;
                        this.update()
                            .then(() => this.isResetting = false)
                            .catch(logger.error);
                    });
            });
        }).catch(logger.error);
    }
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
}