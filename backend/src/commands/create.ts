/* eslint-disable max-len */
import { SlashCommandBuilder } from '@discordjs/builders';
import { getVoiceConnection, joinVoiceChannel } from '@discordjs/voice';
import { RESTPostAPIApplicationCommandsJSONBody } from 'discord-api-types/v9';
import { CacheType, Client, CommandInteraction, Interaction, Message, MessageActionRow, MessageButton, MessageEmbed, VoiceBasedChannel } from 'discord.js';
import logger from '../../lib/logger';
import audioplayer from '../audioplayer';
import { Command } from '../common/command';
import intervalText from '../common/intervalText';

const buttonIds = {
    toggle: 'toggle',
    voice: 'voice'
};

export class CommandCreate extends Command {
    public constructor(protected client: Client) {
        super('create', 'Creates a wartimer widget in the current channel', client);

        client.on('interactionCreate', interaction => {
            this.onInteraction(interaction);
        });
    }
    private async onInteraction(interaction: Interaction): Promise<void> {
        if (!interaction.isButton() || !interaction.channel) {
            return;
        }
        if (!interaction.guild) {
            if (interaction.isRepliable()) {
                interaction.reply({ ephemeral: true, content: 'Unable to complete request' });
            }
            return;
        }
        const [buttonId, messageId] = interaction.customId.split('-');
        const guild = interaction.guild;

        try {
            const roleName = interaction.message.embeds[0].footer?.text.split('@')[1];
            if (roleName && !(await interaction.guild.members.fetch(interaction.user)).roles.cache.some((r) => r.name === roleName)) {
                interaction.reply({ ephemeral: true, content: 'You do not have the necessary permissions Qseng.' });
                logger.info('Insufficient Permissions');
                return;
            }
        } catch {
            // Do nothing
        }

        interaction.channel.messages.fetch(messageId)
            .then(async (message) => {
                switch (buttonId) {
                    case buttonIds.toggle: {
                        if (interaction.component.style === 'SUCCESS') {
                            this.startMessageUpdate(guild.id, message);
                        } else if (interaction.component.style === 'DANGER') {
                            this.stopMessageUpdate(message);
                            this.stopVoice(guild.id, message, true);
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
                            this.startMessageUpdate(guild.id, message, true);
                            this.startVoice(channel, message);
                        } else if (interaction.component.style === 'DANGER') {
                            this.stopVoice(guild.id, message);
                        }
                        break;
                    }
                }
                interaction.deferUpdate();
            })
            .catch(() => {
                interaction.reply({ ephemeral: true, content: 'Unable to fetch the message' });
            });
    }
    private stopVoice(guildId: string, message: Message, skipButtonUpdate = false): void {
        if (!skipButtonUpdate) {
            message.edit({
                components: [this.getButtons(false, true, message.id)]
            });
        }
        getVoiceConnection(guildId)?.destroy();
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
    }
    private startMessageUpdate(guildId: string, message: Message, skipButtonUpdate = false): void {
        // Toggle the button text
        if (!skipButtonUpdate) {
            message.edit({
                embeds: [message.embeds[0].setTitle('Starting...')],
                components: [this.getButtons(false, !getVoiceConnection(guildId), message.id)]
            }).catch(() => {
                logger.log('Unsubscribing, message does not exist');
                intervalText.unsubscribe(message.id);
            });
        }
        // Subscribe the message to updates
        intervalText.subscribe(message.id, guildId, (title, description) => {
            message.edit({
                embeds: [message.embeds[0]
                    .setTitle(title)
                    .setDescription(description)],
            }).catch(() => {
                logger.log('Unsubscribing, message does not exist');
                intervalText.unsubscribe(message.id);
            });
        }, () => {
            // Unsubscribed by the interval handler
            message.edit({
                embeds: [message.embeds[0]
                    .setTitle('Respawn Timer')
                    .setDescription('')],
                components: [this.getButtons(true, true, message.id)]
            }).catch(() => {
                logger.log('Unable to edit message, already unsubscribed');
            });
        });
    }
    private stopMessageUpdate(message: Message): void {
        // Unsubscribe from updates
        intervalText.unsubscribe(message.id);
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

        // const messageData = messages.find((m) => m.guild?.id === guild.id);
        // try {
        //     const msg = await messageData?.message.fetch(true);
        //     if (msg) {
        //         interaction.reply({
        //             content:
        //                 'You can only have one widget per server!\nPlease delete the existing widget first:\n' + msg.url,
        //             ephemeral: true
        //         });
        //         return;
        //     }
        // } catch {
        //     if (messageData) {
        //         intervalText.unsubscribe(messageData.id);
        //         messages = messages.filter((m) => m.id === messageData.id);
        //     }
        // }


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
        ).then(() => {
            return interaction.reply({ content: 'Success', ephemeral: true });
        });
    }
}
