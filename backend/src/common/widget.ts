/* eslint-disable max-lines */
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonInteraction, ButtonStyle, CacheType, CommandInteraction, EmbedBuilder, Guild,
    Message, TextBasedChannel, TextChannel, VoiceBasedChannel
} from 'discord.js';
import { setTimeout } from 'timers/promises';
import logger from '../../lib/logger';
import audioManager, { Voices } from '../util/audioManager';
import textManager from '../util/textManager';
import { getGuild } from '../db/guild.schema';
import { WARTIMER_INTERACTION_ID, WARTIMER_INTERACTION_SPLIT } from './constant';
import { EInteractionType } from './types/interactionType';
import { DBGuild } from './types/dbGuild';

export const widgetButtonIds = {
    text: 'text',
    voice: 'voice',
    settings: 'settings',
    info: 'info'
};
const resetDurationSeconds = 3;
let widgets: Widget[] = [];

export class Widget {
    private textState = false;
    private voiceState = false;
    private isResetting = false;
    private isUpdating = 0;

    /**
     * @param interaction The interaction that created this widget
     * @param message The message that this widget should live in
     * @param guild The guild where the interaction was executed
     * @param managerRole The role that was specified in the command
     */
    // TODO: save widget message link in db, when new widget is created delete old -> This is so I can edit buttons on widgets without them being pressed
    public constructor(
        private message: Message,
        private guild: Guild,
        onReady: (widget: Widget) => void,
        private onDestroy?: (widget: Widget) => void
    ) {
        this.init(onReady).catch(logger.error);
    }
    public static async get(guild: Guild, messageId?: string, channelId?: string): Promise<Widget>;
    public static async get(message?: Message<boolean>): Promise<Widget>;
    public static async get(arg1?: Guild | Message<boolean>, arg2?: string, arg3?: string): Promise<Widget> {
        let message: Message<boolean> | undefined;
        if (!arg2) {
            message = arg1 as Message<boolean>;
        } else {
            const widgetChannel = arg3 ?
                await (arg1 as Guild).channels.fetch(arg3) as TextBasedChannel | undefined : undefined;
            message = arg2 && widgetChannel ? await widgetChannel.messages.fetch().then((messages) =>
                messages.find((message) => message.id === arg2)) : undefined;
        }
        if (!message) return Promise.reject();

        const guild = await message.guild?.fetch().catch(undefined);
        if (!guild) return Promise.reject('Guild not found');
        const dbGuild = await getGuild(guild);
        if (dbGuild.widget.channelId &&
            dbGuild.widget.messageId &&
            (message.channel.id !== dbGuild.widget.channelId ||
                message.id !== dbGuild.widget.messageId)
        ) {
            await guild.channels.fetch(dbGuild.widget.channelId).then((channel) => {
                if (channel?.isTextBased()) {
                    return channel.messages.fetch().then((messages) => messages.find((message) => message.id === dbGuild.widget.messageId)).then((m) => m?.delete());
                }
            });
        }

        dbGuild.widget.channelId = message.channel.id;
        dbGuild.widget.messageId = message.id;
        await dbGuild.save();

        const widget = widgets.find((widget) => widget.getId() === message!.id);

        if (!widget) {
            return new Promise((res) => {
                new Widget(message!, guild, (widget) => {
                    widgets.push(widget);
                    return res(widget);
                }, (widget) => widgets = widgets.filter((w) => w.getId() !== widget.getId()));
            });
        } else {
            return Promise.resolve(widget);
        }
    }
    public static async create(
        interaction: CommandInteraction<CacheType>,
        guild: Guild,
        channel: TextBasedChannel
    ): Promise<void> {
        // checks if guild exists in db, creates document if not
        const dbGuild = await getGuild(guild);

        if (dbGuild.widget.channelId && dbGuild.widget.messageId) {
            await interaction.guild?.channels.fetch(dbGuild.widget.channelId).then((channel) => {
                if (channel?.isTextBased()) {
                    return channel.messages.fetch().then((messages) => {
                        return messages.find((message) => message.id === dbGuild.widget.messageId);
                    }).then((m) => m?.delete());
                }
            });
        }

        return guild.members.fetch(interaction.user)
            .then((member) => {
                if (
                    !(member.user.id === process.env['OWNER_ID']) &&
                    !member.permissions.has('Administrator') &&
                    !member.roles.cache.some((role) => dbGuild.editorRoleIDs.includes(role.id))
                ) {
                    // eslint-disable-next-line max-len
                    throw new Error('You must have editor permissions to use this command! Ask an administrator or editor to adjust the bot `/settings`');
                }
            }).then(async () => {
                await interaction.deferReply({ ephemeral: true }).catch(logger.error);
                channel.send({
                    embeds: [new EmbedBuilder().setTitle('Respawn Timer')]
                }).then((message) => {
                    dbGuild.widget.channelId = message.channel.id;
                    dbGuild.widget.messageId = message.id;
                    dbGuild.save().then(() => {
                        new Widget(message, guild, async (widget) => {
                            widgets.push(widget);
                            await interaction.editReply({ content: 'Widget created.' }).catch(logger.error);
                        }, (widget) => widgets = widgets.filter((w) => w.getId() !== widget.getId()));
                    });
                });
            }).catch((e) => {
                interaction.reply({
                    ephemeral: true,
                    content: (e as Error).message
                }).catch(logger.error);
            });
    }
    private async init(onReady: (widget: Widget) => void): Promise<void> {
        await setTimeout(500);
        await this.message.fetch().then((message) => {
            message.edit({
                components: [this.getButtons()],
                embeds: [EmbedBuilder.from(this.message.embeds[0])]
            }).then((message) => {
                this.message = message;
                onReady(this);
            });
        });
    }

    private async onTextUnsubscribe(): Promise<unknown> { // onUnsubscribe
        this.textState = false;
        return this.update('Respawn Timer', undefined, true);
    }
    private async onAudioUnsubscribe(): Promise<unknown> { // onUnsubscribe
        this.voiceState = false;
        if (!this.textState) {
            return this.update('', undefined, true);
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
    public async update(title?: string, description?: string, force?: boolean): Promise<boolean> {
        if (this.isResetting) {
            return Promise.resolve(false);
        }
        if (!force && this.isUpdating > 0) {
            if (this.isUpdating >= 4) {
                return this.recreateMessage().then(() => false);
            } else {
                this.isUpdating++;
                return Promise.resolve(false);
            }
        }
        this.isUpdating++;
        const embed = new EmbedBuilder()
            .setFooter({ text: 'Lots of new features! Check the settings.' })
            .setDescription(description ?? '-');

        // New title if string with content is passed, old title if empty string is passed, no title if undefined is passed
        if (title !== undefined && title) embed.setTitle(title);

        return this.message.edit({
            components: [this.getButtons()],
            embeds: [embed]
        }).then(() => {
            this.isUpdating = 0;
            return true;
        }).catch(() => {
            if (this.isResetting) return false;
            textManager.unsubscribe(this.message.id);
            this.onDestroy?.(this);
            return false;
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
            }).then(message => message.edit({
                components: [this.getButtons(true)]
            })).then(async (message) => {
                await getGuild(message.guild).then((guild) => {
                    guild.widget.channelId = message.channel.id;
                    guild.widget.messageId = message.id;
                    return guild.save();
                });

                textManager.updateSubscription(this.message.id, message.id);
                const oldMessageId = this.message.id;
                this.message = message;

                const reset = (): void => {
                    this.isResetting = false;
                    this.isUpdating = 0;
                    this.update()
                        .then(() => textManager.updateSubscription(oldMessageId, this.message.id))
                        .catch(logger.error);
                };
                return setTimeout(manual ? 0 : resetDurationSeconds * 1000).then(reset);
            });
        }).catch(logger.error);
    }
    public toggleText(options: {
        interaction: ButtonInteraction;
        dbGuild: DBGuild;
    }): Promise<void> {
        return new Promise((res) => {
            if (!this.textState) {
                this.textState = true;
                textManager.subscribe({
                    msgId: this.message.id,
                    guildId: this.guild.id,
                    customTimings: options.dbGuild.customTimings
                }, this.update.bind(this),
                    res,
                    this.onTextUnsubscribe.bind(this));
            } else {
                this.textState = false;
                textManager.unsubscribe(this.message.id);
                res();
            }
        });
    }
    public async toggleVoice(options?: {
        dbGuild?: DBGuild;
        interaction?: ButtonInteraction<CacheType>;
        channel?: VoiceBasedChannel;
    }): Promise<unknown> {
        if (options?.interaction) {
            if (this.voiceState) {
                this.voiceState = false;
                audioManager.disconnect(this.guild.id);
            } else {
                const channel = (await options.interaction.guild?.members.fetch(options.interaction.user))?.voice.channel ?? undefined;
                if (!channel) {
                    return Promise.reject('You are not in a voice channel!');
                }
                return audioManager.connect(
                    channel,
                    this.onAudioUnsubscribe.bind(this),
                    options.dbGuild
                ).then(() => {
                    this.voiceState = true;
                    if (!this.textState) {
                        return this.update(undefined, undefined);
                    }
                });
            }
        } else if (options?.channel) {
            return audioManager.connect(
                options.channel,
                this.onAudioUnsubscribe.bind(this),
                options.dbGuild
            ).then(() => {
                this.voiceState = true;
                if (!this.textState) {
                    return this.update(undefined, undefined);
                }
            });
        } else {
            this.voiceState = false;
            audioManager.disconnect(this.guild.id);
        }
    }
}