import { joinVoiceChannel, VoiceConnection } from '@discordjs/voice';
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonInteraction, ButtonStyle, CacheType, CommandInteraction, EmbedBuilder, Guild,
    Message, TextBasedChannel, TextChannel
} from 'discord.js';
import { setTimeout } from 'timers/promises';
import logger from '../../lib/logger';
import audioManager from '../audioManager';
import textManager from '../textManager';
import applicationSettings from './applicationSettings';
import { default as DBGuild } from '../db/guild.schema';

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
    private isUpdating = false;
    private lastUpdateTimeStamp: number | undefined;

    /**
     * @param interaction The interaction that created this widget
     * @param message The message that this widget should live in
     * @param guild The guild where the interaction was executed
     * @param managerRole The role that was specified in the command
     */

    public constructor(
        private message: Message,
        private guild: Guild,
        onReady: (widget: Widget) => void,
        private onDestroy?: (widget: Widget) => void
    ) {
        this.init(onReady);
    }
    public static async get(message: Message): Promise<Widget> {
        const guild = await message.guild?.fetch();
        if (!guild) {
            return Promise.reject();
        }
        const widget = widgets.find((widget) => widget.getId() === message.id);
        if (!widget) {
            return new Promise((res) => {
                new Widget(message, guild, (widget) => {
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
        const dbGuild = await DBGuild.findById(guild.id).then((obj) => obj ?? new DBGuild({
            _id: guild.id,
            name: guild.name,
            assistantRoleIDs: [],
            editorRoleIDs: []
        }).save());

        return guild.members.fetch(interaction.user)
            .then((member) => {
                if (
                    !member.permissions.has('Administrator') &&
                    !member.roles.cache.some((role) => dbGuild.editorRoleIDs.includes(role.id))
                ) {
                    // eslint-disable-next-line max-len
                    throw new Error('You must have editor permissions to use this command! Ask an administrator or editor to adjust the bot `/settings`');
                }
            }).then(async () => {
                await interaction.deferReply({ ephemeral: true });
                channel.send({
                    embeds: [new EmbedBuilder().setTitle('Respawn Timer')]
                }).then((message) => {
                    new Widget(message, guild, async (widget) => {
                        widgets.push(widget);
                        await interaction.editReply({ content: 'Widget created.' });
                    }, (widget) => widgets = widgets.filter((w) => w.getId() !== widget.getId()));
                });
            }).catch((e) => {
                interaction.reply({
                    ephemeral: true,
                    content: (e as Error).message
                });
            });
    }
    private async init(onReady: (widget: Widget) => void): Promise<void> {
        await setTimeout(500);
        await this.message.edit({
            components: [this.getButtons()],
            embeds: [EmbedBuilder.from(this.message.embeds[0])]
        }).then((message) => {
            this.message = message;
            logger.info('[' + this.guild.name + '][Start] Widget initiated');
            onReady(this);
        });
    }

    private async onTextUnsubscribe(): Promise<void> { // onUnsubscribe
        logger.info('[' + this.guild.name + '][Unsubscribed Text]');
        this.textState = this.isResetting && this.textState;
        await this.update(undefined, undefined, true);
        this.lastUpdateTimeStamp = undefined;
    }
    private async onAudioUnsubscribe(): Promise<void> { // onUnsubscribe
        logger.info('[' + this.guild.name + '][Unsubscribed Audio]');
        this.voiceState = false;
        if (!this.textState) {
            await this.update(undefined, undefined, true);
        }
    }
    private getButtons(disableToggle = false, disableVoice = false): ActionRowBuilder<ButtonBuilder> {
        return new ActionRowBuilder<ButtonBuilder>()
            .addComponents(new ButtonBuilder()
                .setCustomId(widgetButtonIds.text)
                .setLabel(this.textState ? '■' : '▶')
                .setStyle(this.textState ? ButtonStyle.Danger : ButtonStyle.Success)
                .setDisabled(disableToggle))
            .addComponents(new ButtonBuilder()
                .setCustomId(widgetButtonIds.voice)
                .setLabel(this.voiceState ? '🔇' : '🔊')
                .setStyle(this.voiceState ? ButtonStyle.Danger : ButtonStyle.Success)
                .setDisabled(disableVoice))
            .addComponents(new ButtonBuilder()
                .setCustomId(widgetButtonIds.settings)
                .setLabel('⚙️')
                .setStyle(ButtonStyle.Primary))
            .addComponents(new ButtonBuilder()
                .setCustomId(widgetButtonIds.info)
                .setLabel('ℹ️')
                .setStyle(ButtonStyle.Secondary));
    }
    public getId(): string {
        return this.message.id;
    }
    public async update(title?: string, description?: string, forceQueue?: boolean): Promise<void> {
        if (this.isResetting) {
            return;
        }
        if (forceQueue) {
            while (this.isUpdating) {
                logger.debug('waiting');
                await setTimeout(500);
            }
        }
        if (this.isUpdating) {
            logger.debug('already updating, skip');
            return;
        }
        this.isUpdating = true;

        await this.message.edit({
            components: [this.getButtons()],
            embeds: [EmbedBuilder.from(this.message.embeds[0])
                .setTitle(title ?? 'Respawn Timer')
                .setFooter({ text: '' })
                .setDescription(description ?? '-')]
        }).then((message) => {
            this.message = message;
            this.isUpdating = false;
            const updateDurationMs = Date.now() - (this.lastUpdateTimeStamp ?? Date.now());

            logger.debug('[' + this.guild.name + '][Message] ' + title?.trim() + ' (' + updateDurationMs + 'ms)');

            if (this.lastUpdateTimeStamp) {
                const recreateThresholdMs = applicationSettings.get(this.guild.id).delay * 1000 * 2;
                if (updateDurationMs > recreateThresholdMs) {
                    this.recreateMessage();
                    return;
                }
            }
            this.lastUpdateTimeStamp = Date.now();

        }).catch(() => {
            if (this.isResetting) return;
            textManager.unsubscribe(this.message.id);
            audioManager.unsubscribe(this.guild.id);
            logger.debug('[' + this.guild.name + '][Destroy] Unable to find widget. Destroying instance.');
            this.onDestroy?.(this);
        });
    }

    public recreateMessage(manual = false): void {
        if (!manual) {
            logger.info(
                '[' + this.guild.name + '][Reset] Response took too long! Resending message.'
            );
        }
        this.isResetting = true;
        this.message.delete().finally(() => {
            (this.message.channel as TextChannel).send({
                components: [this.getButtons(true, true)],
                embeds: [EmbedBuilder.from(this.message.embeds[0])
                    .setTitle(manual ? 'Reloading Widget' : 'Discord API Timeout')
                    .setFooter({ text: '' })
                    .setDescription(manual ? 'Resetting..' :
                        `Resetting.. (${resetDurationSeconds}s)
                        This only affects the widget.\nAudio announcements still work.`)]
            }).then(message => message.edit({
                components: [this.getButtons(true)],
            })).then((message) => {
                textManager.updateSubscription(this.message.id, message.id);
                const oldMessageId = this.message.id;
                this.message = message;

                const reset = (): void => {
                    if (!manual) logger.info('[' + this.guild.name + '][Reset] Done!');
                    this.lastUpdateTimeStamp = undefined;
                    this.isUpdating = false;
                    this.isResetting = false;
                    this.update().then(() => {
                        if (this.textState) {
                            if (!textManager.updateSubscription(oldMessageId, this.message.id)) {
                                textManager.subscribe(
                                    this.message.id,
                                    this.guild.id,
                                    this.update.bind(this),
                                    this.onTextUnsubscribe.bind(this));
                            }
                        }
                    });
                };
                setTimeout(manual ? 0 : resetDurationSeconds * 1000).then(reset);
            });
        }).catch();
    }
    public async toggleText(interaction?: ButtonInteraction): Promise<void> {
        this.textState = !this.textState;
        if (interaction) {
            await interaction.deferUpdate().catch((e) => logger.error(e));
        }
        if (interaction && this.textState) {
            textManager.subscribe(
                this.message.id,
                this.guild.id,
                this.update.bind(this),
                this.onTextUnsubscribe.bind(this));
        } else {
            textManager.unsubscribe(this.message.id);
        }
    }
    public async toggleVoice(interaction?: ButtonInteraction<CacheType>): Promise<void> {
        this.voiceState = !this.voiceState;
        // if (interaction) {
        //     await interaction.deferUpdate().catch((e) => logger.error(e));
        // }
        if (interaction && this.voiceState) {
            try {
                const connection = await this.getConnection(interaction);
                interaction.deferUpdate();
                audioManager.subscribe(
                    connection,
                    this.guild.id,
                    this.onAudioUnsubscribe.bind(this)
                );
                if (!this.textState) {
                    await this.update(undefined, undefined, true);
                }
            } catch (e) {
                interaction.reply({
                    ephemeral: true,
                    content: (e as Error).message
                });
                this.voiceState = false;
            }

        } else {
            if (interaction) {
                interaction.deferUpdate();
            }
            audioManager.unsubscribe(this.guild.id);
            // if (!this.textState) { // testing to skip this bc it already runs in onunsub
            //     await this.update(undefined, undefined, true);
            // }
        }
    }


    private async getConnection(interaction: ButtonInteraction): Promise<VoiceConnection> {
        const channel = (await interaction.guild?.members.fetch(interaction.user))?.voice.channel;
        if (!channel) {
            throw new Error('You are not in a voice channel!');
        }
        if (!channel.permissionsFor(this.guild.client.user)?.has('ViewChannel')) {
            throw new Error('I am missing permissions to see your voice channel!\n' +
                'Please contact a server admin to grant permissions.');
        }
        if (!channel.permissionsFor(this.guild.client.user)?.has('Connect')) {
            throw new Error('I am missing permissions to join your voice channel!\n' +
                'Please contact a server admin to grant permissions.');
        }
        if (!channel.permissionsFor(this.guild.client.user)?.has('Speak')) {
            throw new Error('I am missing permissions to speak in your voice channel!\n' +
                'Please contact a server admin to grant permissions.');
        }
        return joinVoiceChannel({
            guildId: channel.guild.id,
            channelId: channel.id,
            adapterCreator: channel.guild.voiceAdapterCreator
        });
    }
}