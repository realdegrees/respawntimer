/* eslint-disable max-lines */
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonInteraction, ButtonStyle, CacheType, CommandInteraction, EmbedBuilder, Guild,
    Message, PartialMessage, TextBasedChannel, TextChannel, VoiceBasedChannel
} from 'discord.js';
import { setTimeout } from 'timers/promises';
import logger from '../../lib/logger';
import audioManager from '../util/audioManager';
import textManager from '../util/textManager';
import { getGuild } from '../db/guild.schema';
import { WARTIMER_ICON_LINK, WARTIMER_INTERACTION_ID, WARTIMER_INTERACTION_SPLIT } from './constant';
import { EInteractionType } from './types/interactionType';
import { DBGuild } from './types/dbGuild';
import { WidgetHandler } from '../widgetHandler';

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
        this.init(onReady).catch(logger.error);
    }
    public static async get(guild: Guild, messageId?: string, channelId?: string): Promise<Widget | undefined>;
    public static async get(message?: Message<boolean> | PartialMessage): Promise<Widget | undefined>;
    public static async get(arg1?: Guild | string | Message<boolean> | PartialMessage, arg2?: string, arg3?: string): Promise<Widget | undefined> {
        return new Promise<Message<boolean> | PartialMessage | undefined>((res, rej) => {
            if (!arg2) {
                res(arg1 as Message<boolean> | PartialMessage);
            } else {
                arg3 ? res((arg1 as Guild).channels.fetch(arg3)
                    .then((channel) => {
                        return !channel?.isTextBased() ? undefined :
                            channel.messages.fetch().then((messages) =>
                                messages.find((message) => message.id === arg2));
                    })) : rej();
            }
        }).then(async (message) => {
            if (!message) return Promise.resolve(undefined);
            if (!message.guild) return Promise.reject('Unable to find to find required data on the Discord API response. Try again later.');
            const dbGuild = await getGuild(message.guild);

            // if the clicked message doesn't equal the message stored in the db we try to find the message corresponding to the stored data and delete it
            if (dbGuild.widget.channelId &&
                dbGuild.widget.messageId &&
                (message.channel.id !== dbGuild.widget.channelId ||
                    message.id !== dbGuild.widget.messageId)) {
                // delete old message
                await message.guild.channels.fetch(dbGuild.widget.channelId)
                    .then((channel) => {
                        if (channel?.isTextBased()) {
                            return channel.messages.fetch().then((messages) => messages.find((message_1) => message_1.id === dbGuild.widget.messageId)).then((m) => m?.delete());
                        }
                    }).catch(logger.error);
            }
            dbGuild.widget.channelId = message.channel.id;
            dbGuild.widget.messageId = message.id;
            await dbGuild.save();
            const widget = WidgetHandler.WIDGETS.find((widget) => widget.getId() === message!.id);
            if (!widget) {
                return new Promise((res) => {
                    if (!message.guild) return Promise.reject('Unable to find to find required data on the Discord API response. Try again later.');
                    new Widget(message, message.guild, !dbGuild.hideWidgetButtons, (widget) => {
                        WidgetHandler.WIDGETS.push(widget);
                        return res(widget);
                    });
                });
            } else {
                return Promise.resolve(widget);
            }

        });
    }
    public setButtonsDisplay(state: boolean): Promise<unknown> {
        this.showButtons = state;
        return this.update({ force: true });
    }

    public static async create(
        interaction: CommandInteraction<CacheType>,
        guild: Guild,
        channel: TextBasedChannel
    ): Promise<unknown> {
        // checks if guild exists in db, creates document if not
        const dbGuild = await getGuild(guild);

        if (dbGuild.widget.channelId && dbGuild.widget.messageId) {
            await Widget.get(guild, dbGuild.widget.messageId, dbGuild.widget.channelId)
                .then((widget) => widget?.message.delete())
                .catch(logger.error);
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
            .then(() => interaction.deferReply({ ephemeral: true }))
            .then(async () =>
                channel.send({
                    embeds: [new EmbedBuilder()
                        .setTitle(DEFAULT_TITLE)
                        .setDescription('-')
                        .setFooter({ text: 'Lots of new features! Check /settings' })]
                }).then((message) => {
                    dbGuild.widget.channelId = message.channel.id;
                    dbGuild.widget.messageId = message.id;
                    dbGuild.save().then(() => {
                        new Widget(
                            message,
                            guild,
                            !dbGuild.hideWidgetButtons,
                            (widget) => WidgetHandler.WIDGETS.push(widget));
                    });
                }).finally(() => interaction.editReply({ content: 'Widget created.' })))
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
    }): Promise<boolean> {
        if (this.isResetting) {
            return Promise.resolve(false);
        }
        if (!options?.force && this.isUpdating > 0) {
            if (this.isUpdating >= 4) {
                return this.recreateMessage().then(() => false);
            } else {
                this.isUpdating++;
                return Promise.resolve(false);
            }
        }
        this.isUpdating++;

        const embed = new EmbedBuilder();
        if (!options?.description) {
            const nextWar = await getGuild(this.guild).then((dbGuild) => {
                embed.setFooter({ text: `Raidhelper Integration » ${dbGuild.raidHelper.apiKey ? 'Enabled' : 'Disabled'}`});
                const event = dbGuild.raidHelper.events.reduce((lowest, current) =>
                    Math.abs(current.startTime * 1000 - Date.now()) < Math.abs(lowest.startTime * 1000 - Date.now()) ? current : lowest);
                return `On Standby for **${event.title}**\n*at* <t:${event.startTime}:t> *on* <t:${event.startTime}:d>`;
            }).catch(() => '-');
            embed
                .setDescription(nextWar)
                .setAuthor({ name: options?.title ?? DEFAULT_TITLE, iconURL: WARTIMER_ICON_LINK });
        } else {
            embed.setDescription(options.description);
            if (options.title) {
                embed.setAuthor({ name: options.title, iconURL: WARTIMER_ICON_LINK });
            }
        }

        return this.message.edit({
            components: this.showButtons ? [this.getButtons()] : [],
            embeds: [embed]
        }).then(() => {
            this.isUpdating = 0;
            return true;
        }).catch(() => {
            if (this.isResetting) return false;
            textManager.unsubscribe(this.message.id);
            return this.message.delete()
                .then(() => false)
                .catch(() => false);
        });
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
                await getGuild(message.guild).then((guild) => {
                    guild.widget.channelId = message.channel.id;
                    guild.widget.messageId = message.id;
                    return guild.save();
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
                audioManager.disconnect(this.guild, options.dbGuild);
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
            audioManager.disconnect(this.guild, options.dbGuild);
        }
    }
}