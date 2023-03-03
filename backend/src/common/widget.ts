import { getVoiceConnection, joinVoiceChannel } from '@discordjs/voice';
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonInteraction, ButtonStyle, CacheType, EmbedBuilder, Guild,
    Message, Role, TextChannel
} from 'discord.js';
import logger from '../../lib/logger';
import audioManager from '../audioManager';
import respawnInterval from './respawnInterval';

const buttonIds = {
    text: 'text',
    voice: 'voice',
    reload: 'reload',
    info: 'info'
};
const resetDurationSeconds = 7;
const timeoutDurationMillis = 800;

export class Widget {
    private toggleState = false;
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
        await new Promise((res) => setTimeout(res, 500));
        await this.message.edit({
            components: [this.getButtons()],
            embeds: [EmbedBuilder.from(this.message.embeds[0])
                .setFooter({
                    text: this.getManagerRoleFooterText()
                })]
        }).then((message) => {
            this.message = message;
            logger.info('[' + this.guild.name + '][Start] Widget initiated');
            respawnInterval.subscribe(
                this.message.id,
                this.guild.id,
                this.update.bind(this),
                () => {
                    this.toggleText.call(this);
                    this.toggleVoice.call(this);
                },
                this.resetEmbed.bind(this));
            onReady(this);
        });
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
                .setLabel(this.toggleState ? '■' : '▶')
                .setStyle(this.toggleState ? ButtonStyle.Danger : ButtonStyle.Success)
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
    public async update(title?: string, description?: string): Promise<void> {
        if (this.isUpdating || this.isResetting) {
            return;
        }
        this.isUpdating = true;
        const preEditTimeStamp = Date.now();
        await this.message.edit({
            components: [this.getButtons()],
            embeds: [EmbedBuilder.from(this.message.embeds[0])
                .setTitle(title ?? 'Respawn Timer')
                .setDescription(description ??
                    (this.voiceState ? 'Audio On' : '-'))]
        }).then((message) => {
            this.message = message;
            this.isUpdating = false;
            const editDuration = new Date(Date.now() - preEditTimeStamp).getMilliseconds();
            logger.debug(
                '[' + this.guild.name + '] Updated message in: ' + editDuration + 'ms (' + title?.trim() + ')'
            );
            if (editDuration > 500) {
                this.recreateMessage();
            }
        }).catch(() => {
            if (this.isResetting) return;

            respawnInterval.disableText(this.message.id);
            respawnInterval.unsubscribe(this.message.id);
            getVoiceConnection(this.guild.id)?.disconnect();
            getVoiceConnection(this.guild.id)?.destroy();
            logger.debug('[' + this.guild.name + '][Destroy] Unable to find widget. Destroying instance.');
            this.onDestroy?.(this);
        });
    }
    public resetEmbed(): void {
        this.isResetting = false;
        this.isUpdating = false;
        respawnInterval.enableText(this.message.id);
    }
    public recreateMessage(manual = false): void {
        if (!manual) {
            logger.info(
                '[' + this.guild.name + '][Timeout] Response took longer than ' + timeoutDurationMillis + 'ms!'
                );
        }
        this.isResetting = true;
        respawnInterval.disableText(this.message.id);
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
                respawnInterval.updateSubscription(this.message.id, message.id);
                this.message = message;

                const reset = (): void => {
                    if (!manual) logger.info('[' + this.guild.name + '] Resuming text updates!');
                    this.resetEmbed();
                };
                setTimeout(reset, manual ? 0 : resetDurationSeconds * 1000);
            });
        }).catch();
    }
    public async toggleText(interaction?: ButtonInteraction): Promise<void> {
        if (interaction && !await this.checkPermission(interaction)) {
            await interaction.reply({ ephemeral: true, content: 'You do not have the necessary permissions.' });
            return;
        }
        this.toggleState = !this.toggleState;
        if (interaction && !interaction.deferred) {
            await interaction.deferUpdate().catch((e) => logger.error(e));
        }
        if (interaction && this.toggleState) {
            respawnInterval.enableText(this.message.id);
        } else {
            respawnInterval.disableText(this.message.id);
            this.update();
        }
    }
    public async toggleVoice(interaction?: ButtonInteraction<CacheType>): Promise<void> {
        if (interaction && !await this.checkPermission(interaction)) {
            await interaction.reply({ ephemeral: true, content: 'You do not have the necessary permissions.' });
            return;
        }
        await interaction?.deferUpdate();
        this.voiceState = !this.voiceState;
        if (interaction && this.voiceState) {
            try {
                await this.connect(interaction);
                if (!this.toggleState) {
                    await this.update('Respawn Timer', 'Audio On');
                }
            } catch {
                this.voiceState = false;
            }

        } else {
            this.disconnect();
            if (interaction && !this.toggleState) {
                await this.update('Respawn Timer', '-');
            }
        }
    }
    private async checkPermission(interaction: ButtonInteraction): Promise<boolean> {
        return this.managerRoles.length === 0 || (await this.guild.members
            .fetch(interaction.user)).roles.cache
            .some((userRole) => this.managerRoles
                .map((role) => role.id)
                .includes(userRole.id));
    }

    private async connect(interaction: ButtonInteraction): Promise<void> {
        const channel = (await interaction.guild?.members.fetch(interaction.user))?.voice.channel;
        if (!channel) {
            await interaction.reply({ ephemeral: true, content: 'You are not in a voice channel!' });
            throw new Error('Not in a voice channel');
        }
        const connection = joinVoiceChannel({
            guildId: channel.guild.id,
            channelId: channel.id,
            adapterCreator: channel.guild.voiceAdapterCreator
        });
        audioManager.subscribe(connection, this.guild.id);
    }
    private disconnect(): void {
        audioManager.unsubscribe(this.guild.id);
        getVoiceConnection(this.guild.id)?.destroy();
    }
}