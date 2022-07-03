import { SlashCommandBuilder } from '@discordjs/builders';
import { getVoiceConnection, joinVoiceChannel } from '@discordjs/voice';
import { channel } from 'diagnostics_channel';
import { RESTPostAPIApplicationCommandsJSONBody } from 'discord-api-types/v9';
import { CacheType, CommandInteraction, Message, MessageActionRow, MessageButton, MessageEmbed } from 'discord.js';
import logger from '../../lib/logger';
import audioplayer from '../audioplayer';
import { Command } from '../common/command';
import { clamp, getRespawnInfo } from '../common/util';

let interval: string | number | NodeJS.Timer | undefined;

const enabledButton = new MessageButton()
    .setCustomId('enabledButton')
    .setLabel('Stop')
    .setStyle('DANGER');
const disabledButton = new MessageButton()
    .setCustomId('disabledButton')
    .setLabel('Start')
    .setStyle('SUCCESS');
const voiceOnButton = new MessageButton()
    .setCustomId('voiceOnButton')
    .setLabel('🔇')
    .setStyle('DANGER');
const voiceOffButton = new MessageButton()
    .setCustomId('voiceOffButton')
    .setLabel('🔊')
    .setStyle('SUCCESS');
const defaultEmbed = new MessageEmbed()
    .setColor('GREEN')
    .setTitle('Respawn Timer');
let embed = new MessageEmbed(defaultEmbed);
let voiceStatus = false;

class CommandCreate extends Command {
    public constructor() {
        super('create', 'Creates a wartimer widget in the current channel');
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

        if (!interaction.channel) {
            logger.log('not a channel');
            return;
        }
        return interaction.channel.send({
            embeds: [embed],
            components: [
                new MessageActionRow()
                    .addComponents(disabledButton)
                    .addComponents(voiceOffButton)
            ]
        }).then((message) => {
            embed = new MessageEmbed(embed).setFooter({ text: 'ID: ' + message.id });
            return message.edit({ embeds: [new MessageEmbed(embed)] });
        }).then((message) => {
            message.client.on('interactionCreate', async interaction => {

                if (!interaction.isButton()) return;
                logger.log(interaction.customId);

                switch (interaction.customId) {
                    case enabledButton.customId:
                        message.edit({
                            components: [getButtonRow(false, false)]
                        }).then(() => {
                            voiceStatus = false;
                            clearInterval(interval);
                            if (interaction.guild) {
                                getVoiceConnection(interaction.guild?.id)?.destroy();
                            }
                            embed = defaultEmbed;
                            message.edit({embeds: [new MessageEmbed(embed)]});
                        });
                        break;
                    case disabledButton.customId:
                        message.edit({
                            components: [getButtonRow(true, voiceStatus)]
                        }).then(() => {
                            startTimer(message);
                        });
                        break;
                    case voiceOnButton.customId:
                        message.edit({
                            components: [getButtonRow(true, false)]
                        }).then(() => {
                            voiceStatus = false;
                            if (interaction.guild) {
                                getVoiceConnection(interaction.guild?.id)?.destroy();
                            }
                        });
                        break;
                    case voiceOffButton.customId:
                        {
                            const channel = (await interaction.guild?.members.fetch(interaction.user))?.voice.channel;

                            if (!channel) {
                                interaction.reply({ ephemeral: true, content: 'You are not in a voice channel!' });
                                return;
                            }
                            const connection = joinVoiceChannel({
                                guildId: channel.guild.id,
                                channelId: channel.id,
                                adapterCreator: channel.guild.voiceAdapterCreator
                            });
                            audioplayer.subscribe(connection);

                            message.edit({
                                components: [getButtonRow(true, true)]
                            }).then(() => {
                                voiceStatus = true;
                                startTimer(message);
                            });
                            break;
                        }

                }
                interaction.deferUpdate();
            });


            return undefined;
        })
            .then(() => {
                interaction.reply('Widget created');
            });
    }
}

const getButtonRow = (updateStatus: boolean, voiceStatus: boolean): MessageActionRow => {
    return new MessageActionRow()
        .addComponents(updateStatus ? enabledButton : disabledButton)
        .addComponents(voiceStatus ? voiceOnButton : voiceOffButton);
};
const startTimer = (message: Message): void => {
    interval = setInterval(() => {
        const time = getRespawnInfo();

        if (voiceStatus && message.guild && getVoiceConnection(message.guild.id)) {
            audioplayer.play(Math.round(time.timeToRespawn));
        }
        if (time.timeToRespawn > 5 && Math.round(time.timeToRespawn) % 2 === 0) {
            return;
        }
        const barWidth = 25;
        const fullBar = '■'.repeat(
            clamp(
                Math.round(barWidth * ((time.currRespawnTimer - time.timeToRespawn) / time.currRespawnTimer)),
                0,
                barWidth
            )
        );
        const emptyBar = '□'.repeat(barWidth - fullBar.length);
        embed = new MessageEmbed(embed)
            .setTitle(time.remainingRespawns > 0 ?
                time.timeToRespawn > 0 ?
                    'ᐳ ' + time.timeToRespawn.toString() + (time.timeToRespawn === 1 ? ' **LAST RESPAWN** ' : '') :
                    'ᐳ **RESPAWN**' : 'ᐳ **NO RESPAWNS**')
            .setDescription(
                '**[' + fullBar.concat(emptyBar) + ']**\n' +
                '\nThis Respawn Duration: **' + (time.currRespawnTimer > 0 ? time.currRespawnTimer : '-') + '**' +
                '\nNext Respawn Duration: **' + (time.nextRespawnTimer > 0 ? time.nextRespawnTimer : '-') + '**' +
                '\nRemaining Respawns: **' + time.remainingRespawns + '**');
        message.edit({ embeds: [new MessageEmbed(embed)] }).catch(() => {
            logger.error('Message not found');
            clearInterval(interval);
        });
    }, 1000);
};
export default new CommandCreate();