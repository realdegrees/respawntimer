import { getVoiceConnection, joinVoiceChannel, VoiceConnection } from '@discordjs/voice';
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonInteraction, ButtonStyle, CacheType, EmbedBuilder, Guild,
    Message, Role, TextChannel
} from 'discord.js';
import { setTimeout } from 'timers/promises';
import logger from '../../lib/logger';
import audioManager from '../audioManager';
import textManager from '../textManager';

const buttonIds = {
    text: 'text',
    voice: 'voice',
    reload: 'reload',
    info: 'info'
};
const resetDurationSeconds = 7;
const timeoutDurationMillis = 800;

export class Widget {
    private textState = false;
    private voiceState = false;
    private isResetting = false;
    private isUpdating = false;

    /**
     * @param interaction The interaction that created this widget
     * @param message The message that this widget should live in
     * @param guild The guild where the interaction was executed
     * @param managerRole The role that was specified in the command
     */

    public constructor(
        private message: Message,
        private guild: Guild,
        private managerRoles: Role[],
        onReady: (widget: Widget) => void,
        private onDestroy?: (widget: Widget) => void
    ) {
        this.init(onReady);
    }
    private async init(onReady: (widget: Widget) => void): Promise<void> {
        this.managerRoles = this.managerRoles.length > 0 ? this.managerRoles : this.parseManagerRole();
        await setTimeout(500);
        await this.message.edit({
            components: [this.getButtons()],
            embeds: [EmbedBuilder.from(this.message.embeds[0])
                .setFooter({
                    text: this.getManagerRoleFooterText()
                })]
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
    }
    private async onAudioUnsubscribe(): Promise<void> { // onUnsubscribe
        logger.info('[' + this.guild.name + '][Unsubscribed Audio]');
        this.voiceState = false;
        if (!this.textState) {
            await this.update(undefined, undefined, true);
        }
    }
    private getManagerRoleFooterText(): string {
        switch (this.managerRoles.length) {
            case 0: return 'Manager Roles: None';
            case 1: return 'Manager Role: @' + this.managerRoles[0].name;
            default: return 'Manager Roles:\n' + this.managerRoles.map((role) => '@' + role.name).join('\n');
        }
    }
    private parseManagerRole(): Role[] {
        const roleNames = this.message.embeds[0].footer?.text.split('@').slice(1);
        return roleNames ? roleNames
            .map((roleName) => roleName.trim())
            .map((roleName) => this.guild.roles.cache.find((role) => role.name === roleName))
            .filter((role): role is Role => !!role) : [];

    }
    private getButtons(disableToggle = false, disableVoice = false): ActionRowBuilder<ButtonBuilder> {
        return new ActionRowBuilder<ButtonBuilder>()
            .addComponents(new ButtonBuilder()
                .setCustomId(buttonIds.text + '-' + this.message.id)
                .setLabel(this.textState ? '■' : '▶')
                .setStyle(this.textState ? ButtonStyle.Danger : ButtonStyle.Success)
                .setDisabled(disableToggle))
            .addComponents(new ButtonBuilder()
                .setCustomId(buttonIds.voice + '-' + this.message.id)
                .setLabel(this.voiceState ? '🔇' : '🔊')
                .setStyle(this.voiceState ? ButtonStyle.Danger : ButtonStyle.Success)
                .setDisabled(disableVoice))
            // .addComponents(new ButtonBuilder()
            //     .setCustomId(buttonIds.reload + '-' + this.message.id)
            //     .setLabel('⟳')
            //     .setStyle(ButtonStyle.Primary))
            .addComponents(new ButtonBuilder()
                .setCustomId(buttonIds.info + '-' + this.message.id)
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
            return;
        }
        this.isUpdating = true;
        const preEditTimeStamp = Date.now();
        await this.message.edit({
            components: [this.getButtons()],
            embeds: [EmbedBuilder.from(this.message.embeds[0])
                .setTitle(title ?? 'Respawn Timer')
                .setDescription(description ?? '-')]
        }).then((message) => {
            this.message = message;
            this.isUpdating = false;
            const editDuration = new Date(Date.now() - preEditTimeStamp).getMilliseconds();
            // logger.debug(
            //     '[' + this.guild.name + '] Updated message (' + editDuration + 'ms) (' + title?.trim() + ')'
            // );
            if (editDuration > 500) {
                this.recreateMessage();
            }
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
                '[' + this.guild.name + '][Timeout] Response took longer than ' + timeoutDurationMillis + 'ms!'
            );
        }
        this.isResetting = true;
        textManager.unsubscribe(this.message.id);
        this.message.delete().finally(() => {
            (this.message.channel as TextChannel).send({
                components: [this.getButtons(true, true)],
                embeds: [EmbedBuilder.from(this.message.embeds[0])
                    .setTitle(manual ? 'Reloading Widget' : 'Discord API Timeout')
                    .setDescription(manual ? 'Resetting..' :
                        `Resetting.. (${resetDurationSeconds}s)
                        This only affects the widget.\nAudio announcements still work.`)]
            }).then(message => message.edit({
                components: [this.getButtons(true)],
            })).then((message) => {
                textManager.updateSubscription(this.message.id, message.id);
                this.message = message;

                const reset = (): void => {
                    if (!manual) logger.info('[' + this.guild.name + '] Resuming text updates!');
                    this.isResetting = false;
                    this.isUpdating = false;
                    if (this.textState) {
                        textManager.subscribe(
                            this.message.id,
                            this.guild.id,
                            this.update.bind(this),
                            this.onTextUnsubscribe.bind(this));
                    }
                };
                setTimeout(manual ? 0 : resetDurationSeconds * 1000).then(reset);
            });
        }).catch();
    }
    public async toggleText(interaction?: ButtonInteraction): Promise<void> {
        if (interaction && !await this.checkPermission(interaction)) {
            await interaction.reply({ ephemeral: true, content: 'You do not have the necessary permissions.' });
            return;
        }
        this.textState = !this.textState;
        if (interaction && !interaction.deferred) {
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
            // await this.update(undefined, undefined, true); // testing to skip this bc it already runs in onunsub
        }
    }
    public async toggleVoice(interaction?: ButtonInteraction<CacheType>): Promise<void> {
        if (interaction && !await this.checkPermission(interaction)) {
            await interaction.reply({ ephemeral: true, content: 'You do not have the necessary permissions.' });
            return;
        }
        this.voiceState = !this.voiceState;
        if (interaction && !interaction.deferred) {
            await interaction.deferUpdate().catch((e) => logger.error(e));
        }
        if (interaction && this.voiceState) {
            try {
                const connection = await this.getConnection(interaction);
                audioManager.subscribe(
                    connection,
                    this.guild.id,
                    this.onAudioUnsubscribe.bind(this)
                );
                if (!this.textState) {
                    await this.update(undefined, undefined, true);
                }
            } catch {
                this.voiceState = false;
            }

        } else {
            audioManager.unsubscribe(this.guild.id);
            // if (!this.textState) { // testing to skip this bc it already runs in onunsub
            //     await this.update(undefined, undefined, true);
            // }
        }
    }
    private async checkPermission(interaction: ButtonInteraction): Promise<boolean> {
        return this.managerRoles.length === 0 || (await this.guild.members
            .fetch(interaction.user)).roles.cache
            .some((userRole) => this.managerRoles
                .map((role) => role.id)
                .includes(userRole.id));
    }

    private async getConnection(interaction: ButtonInteraction): Promise<VoiceConnection> {
        const channel = (await interaction.guild?.members.fetch(interaction.user))?.voice.channel;
        if (!channel) {
            await interaction.reply({ ephemeral: true, content: 'You are not in a voice channel!' });
            throw new Error('Not in a voice channel');
        }
        return joinVoiceChannel({
            guildId: channel.guild.id,
            channelId: channel.id,
            adapterCreator: channel.guild.voiceAdapterCreator
        });
    }
}