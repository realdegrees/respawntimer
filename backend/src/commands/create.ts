/* eslint-disable max-len */
import { SlashCommandBuilder } from '@discordjs/builders';
import { getVoiceConnection, joinVoiceChannel } from '@discordjs/voice';
import { APIRole, RESTPostAPIApplicationCommandsJSONBody } from 'discord-api-types/v9';
import { ButtonInteraction, CacheType, Client, CommandInteraction, Guild, GuildTextBasedChannel, Message, MessageActionRow, MessageButton, MessageEmbed, Role, TextBasedChannel, TextChannel, VoiceBasedChannel, VoiceChannel } from 'discord.js';
import logger from '../../lib/logger';
import audioplayer from '../audioplayer';
import { Command } from '../common/command';
import intervalText from '../common/intervalText';


const buttonIds = {
    toggle: 'toggle',
    voice: 'voice'
};
let messages: {
    id: string;
    message: Message;
    role: Role | APIRole | null;
    channel: GuildTextBasedChannel;
    guild: Guild | null;
    voice: boolean;
}[] = [];

export class CommandCreate extends Command {
    public constructor(protected client: Client) {
        super('create', 'Creates a wartimer widget in the current channel', client);

        client.on('interactionCreate', async interaction => {
            if (!interaction.isButton() || !interaction.channel) return;
            const [buttonId, messageId] = interaction.customId.split('-');
            const role = messages.find((m) => m.id === messageId)?.role;

            if (role && (await interaction.guild?.members.fetch(interaction.user))?.roles.cache.every((r) => r.name !== role.name)) {
                interaction.reply({ ephemeral: true, content: 'You do not have the necessary permissions Qseng.' });
                logger.info('Insufficient Permissions');
                return;
            }

            interaction.channel.messages.fetch(messageId)
                .then(async (message) => {
                    switch (buttonId) {
                        case buttonIds.toggle: {
                            if (interaction.component.style === 'SUCCESS') {
                                this.startMessageUpdate(message);
                            } else if (interaction.component.style === 'DANGER') {
                                this.stopMessageUpdate(message);
                                this.stopVoice(message, true);
                            }
                            break;
                        }
                        case buttonIds.voice: {
                            const channel = (await interaction.guild?.members.fetch(interaction.user))?.voice.channel;
                            if (!channel) {
                                interaction.reply({ ephemeral: true, content: 'You are not in a voice channel!' });
                                return;
                            }
                            if (interaction.component.style === 'SUCCESS') {
                                this.startMessageUpdate(message, true);
                                this.startVoice(channel, message);
                            } else if (interaction.component.style === 'DANGER') {
                                this.stopVoice(message);
                            }
                            break;
                        }
                    }
                    interaction.deferUpdate();
                })
                .catch(() => {
                    interaction.reply({ ephemeral: true, content: 'Unable to fetch the message' });
                });
        });
    }
    private stopVoice(message: Message, skipButtonUpdate = false): void {
        if (!skipButtonUpdate) {
            message.edit({
                components: [this.getButtons(false, true, message.id)]
            });
        }
        const messageData = messages.find((m) => m.id === message.id && m.voice);
        if (messageData?.guild?.id) {
            getVoiceConnection(messageData.guild.id)?.destroy();
        }
    }
    private startVoice(channel: VoiceBasedChannel, message: Message): void {
        const connection = joinVoiceChannel({
            guildId: channel.guild.id,
            channelId: channel.id,
            adapterCreator: channel.guild.voiceAdapterCreator
        });

        audioplayer.subscribe(connection);
        message.edit({
            components: [this.getButtons(false, false, message.id)]
        });
        const messageData = messages.find((m) => m.id === message.id);
        if (messageData) {
            messageData.voice = true;
        }
    }
    private startMessageUpdate(message: Message, skipButtonUpdate = false): void {
        // Toggle the button text
        if (!skipButtonUpdate) {
            message.edit({
                embeds: [new MessageEmbed({
                    title: 'Starting...',
                })],
                components: [this.getButtons(false, true, message.id)]
            });
        }
        // Subscribe the message to updates
        intervalText.subscribe(message.id, (title, description) => {
            message.edit({
                embeds: [message.embeds[0]
                    .setTitle(title)
                    .setDescription(description)],
            }).catch(() => {
                intervalText.unsubscribe(message.id);
                this.stopVoice(message, true);
                messages = messages.filter((m) => m.id === message.id);
                logger.error('Tried to update deleted channel, removing this channel.');
            });
        });
    }
    private stopMessageUpdate(message: Message): void {
        // Unsubscribe from updates
        intervalText.unsubscribe(message.id);
        // Change message to default
        message.edit({
            embeds: [message.embeds[0]
                .setTitle('Respawn Timer')
                .setDescription('')],
            components: [this.getButtons(true, true, message.id)]
        });
    }
    private getButtons(toggleState: boolean, voiceState: boolean, messageId: string): MessageActionRow {
        return new MessageActionRow()
            .addComponents(new MessageButton()
                .setCustomId(buttonIds.toggle + '-' + messageId)
                .setLabel(toggleState ? 'Start' : 'Stop')
                .setStyle(toggleState ? 'SUCCESS' : 'DANGER'))
            .addComponents(new MessageButton()
                .setCustomId(buttonIds.voice + '-' + messageId)
                .setLabel(voiceState ? '🔊' : '🔇')
                .setStyle(voiceState ? 'SUCCESS' : 'DANGER'));
    }
    public build(): RESTPostAPIApplicationCommandsJSONBody {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(this.description)
            .addChannelOption((option) => option
                .setName('channel')
                .setDescription('The channel where the timer widget will be posted')
                .setRequired(false))
            .addRoleOption((option) => option
                .setName('managerrole')
                .setDescription('This role is allowed to manage the timer')
                .setRequired(false))
            .toJSON();
    }
    // eslint-disable-next-line @typescript-eslint/require-await
    public async execute(interaction: CommandInteraction<CacheType>): Promise<void> {
        const role = interaction.options.getRole('managerrole');
        const channel = interaction.options.getChannel('channel') ?? interaction.channel;
        const guild = interaction.guild;


        if (!guild) {
            interaction.reply('This cannot be used in DMs');
            return;
        }
        if (channel?.type !== 'GUILD_TEXT') {
            interaction.reply('Invalid channel');
            return;
        }

        const messageData = messages.find((m) => m.guild?.id === guild.id);
        try {
            const msg = await messageData?.message.fetch(true);
            if (msg) {
                interaction.reply({
                    content:
                        'You can only have one widget per server!\nPlease delete the existing widget first:\n' + msg.url,
                    ephemeral: true
                });
                return;
            }
        } catch {
            if (messageData) {
                intervalText.unsubscribe(messageData.id);
                messages = messages.filter((m) => m.id === messageData.id);
            }
        }

        
        channel.send({
            embeds: [new MessageEmbed({
                title: 'Respawn Timer',
            })]
        }).then((message) =>
            message.edit({
                components: [
                    new MessageActionRow()
                        .addComponents(new MessageButton()
                            .setCustomId(buttonIds.toggle + '-' + message.id)
                            .setLabel('Start')
                            .setStyle('SUCCESS'))
                        .addComponents(new MessageButton()
                            .setCustomId(buttonIds.voice + '-' + message.id)
                            .setLabel('🔊')
                            .setStyle('SUCCESS'))
                ],
                embeds: [new MessageEmbed({
                    title: 'Respawn Timer',
                    footer: { text: 'ID: ' + message.id + (role ? '\nManager Role: @' + role.name : '') }
                })]
            })
        ).then((message) => {
            messages.push({
                id: message.id,
                channel: message.channel as TextChannel,
                guild: guild,
                role,
                message,
                voice: false
            });
            return interaction.reply({ content: 'Success', ephemeral: true });
        });
    }
}
