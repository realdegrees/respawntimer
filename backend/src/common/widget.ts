import { getVoiceConnection, joinVoiceChannel } from '@discordjs/voice';
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonInteraction, ButtonStyle, CacheType, EmbedBuilder, Guild,
    Message, Role, TextChannel
} from 'discord.js';
import logger from '../../lib/logger';
import { AudioManager } from '../audioManager';
import respawnInterval from './respawnInterval';

const buttonIds = {
    toggle: 'toggle',
    voice: 'voice',
    reload: 'reload',
    info: 'info'
};
const resetDurationSeconds = 7;
const timeoutDurationSeconds = 3;

export class Widget {
    private toggleState = false;
    private voiceState = false;
    private isResetting = false;
    private audioManager = new AudioManager();

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
        logger.log(this.getManagerRoleFooterText());
        await this.message.edit({
            components: [this.getButtons()],
            embeds: [EmbedBuilder.from(this.message.embeds[0])
                .setFooter({
                    text: this.getManagerRoleFooterText()
                })]
        }).then((message) => {
            this.message = message;
            logger.log('Widget ' + this.getId() + ' initiated.\nRole(s): ' +
                this.managerRoles.map((role) => '\n@' + role.name) + '\nChannel: ' + message.channel.id
                + '\nGuild: ' + this.guild.name);
            respawnInterval.subscribe(
                this.message.id,
                this.guild.id,
                this.audioManager,
                this.update.bind(this),
                () => {
                    logger.log('SHOULD NOT BE CALLED UNLESS WAR END');
                    this.toggle.call(this);
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
                .setCustomId(buttonIds.toggle + '-' + this.message.id)
                .setLabel(this.toggleState ? '■' : '▶')
                .setStyle(this.toggleState ? ButtonStyle.Danger : ButtonStyle.Success)
                .setDisabled(disableToggle))
            .addComponents(new ButtonBuilder()
                .setCustomId(buttonIds.voice + '-' + this.message.id)
                .setLabel(this.voiceState ? '🔇' : '🔊')
                .setStyle(this.voiceState ? ButtonStyle.Danger : ButtonStyle.Success)
                .setDisabled(disableVoice))
            .addComponents(new ButtonBuilder()
                .setCustomId(buttonIds.reload + '-' + this.message.id)
                .setLabel('⟳')
                .setStyle(ButtonStyle.Primary))
            .addComponents(new ButtonBuilder()
                .setCustomId(buttonIds.info + '-' + this.message.id)
                .setLabel('ℹ️')
                .setStyle(ButtonStyle.Secondary));
    }
    public getId(): string {
        return this.message.id;
    }
    public async update(title?: string, description?: string): Promise<void> {

        const beforeEditTimestamp = Date.now();
        await this.message.edit({
            components: [this.getButtons()],
            embeds: [EmbedBuilder.from(this.message.embeds[0])
                .setTitle(title ?? 'Respawn Timer')
                .setDescription(description ??
                    (this.voiceState ? 'Audio On' : 'Use the buttons below to start the timer'))]
        }).then((message) => {
            this.message = message;
            if (Date.now() - beforeEditTimestamp > timeoutDurationSeconds * 1000) {
                this.recreateMessage();
            }
        }).catch(async () => {
            if (this.isResetting) return;

            respawnInterval.disableText(this.message.id);

            logger.info('Unable to edit message ' + this.message.id +
                ' unsubscribing updates and attempting todelete message.');
            try {
                await this.message.delete();
                logger.info('Deleted message');
            } catch {
                logger.info('Unable to delete message' + this.message.id);
            }
            this.onDestroy?.(this);
        });
    }
    public async resetEmbed(): Promise<void> {
        this.toggleState = false;
        await this.update('Respawn Timer', this.voiceState ? 'Audio On' : 'Use the buttons below to start the timer');
        this.isResetting = false;
    }
    public recreateMessage(manual = false): void {
        if (!manual) logger.info('Response took too long, taking timeout');
        this.isResetting = true;
        this.message.delete().finally(() => {
            (this.message.channel as TextChannel).send({
                components: [this.getButtons(true, true)],
                embeds: [EmbedBuilder.from(this.message.embeds[0])
                    .setTitle(manual ? 'Reloading Widget' : 'Slow Discord API Response')
                    .setDescription(manual ? 'Resetting..' :
                        `Resetting.. (${resetDurationSeconds}s)
                        This only affects the widget.\nAudio announcements still work.`)]
            }).then((message) => {
                respawnInterval.updateSubscription(this.message.id, message.id);
                this.message = message;
                this.message.edit({
                    components: [this.getButtons(true)],
                });

                const reset = (): void => {
                    if (!manual) logger.info('Resuming updates after timeout');
                    if (!this.toggleState) {
                        this.resetEmbed();
                    }
                };
                setTimeout(reset, manual ? 0 : resetDurationSeconds * 1000);
            });
        }).catch();
    }
    public async toggle(interaction?: ButtonInteraction): Promise<void> {
        if (interaction && !await this.checkPermission(interaction)) {
            await interaction.reply({ ephemeral: true, content: 'You do not have the necessary permissions.' });
            return;
        }
        this.toggleState = !this.toggleState;
        if (interaction && !interaction.deferred) {
            await interaction.deferUpdate().catch((e) => logger.log(e));
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
                respawnInterval.enableVoice(this.message.id);
            } catch {
                this.voiceState = false;
                respawnInterval.disableVoice(this.message.id);
            }

        } else {
            respawnInterval.disableVoice(this.message.id);
            this.disconnect();
            if (interaction && !this.toggleState) {
                this.update('Respawn Timer', 'Use the buttons below to start the timer');
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
        this.audioManager.subscribe(connection);
    }
    private disconnect(): void {
        getVoiceConnection(this.guild.id)?.destroy();
    }
}