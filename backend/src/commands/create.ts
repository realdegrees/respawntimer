/* eslint-disable max-len */
import { SlashCommandBuilder } from '@discordjs/builders';
import { RESTPostAPIApplicationCommandsJSONBody } from 'discord-api-types/v9';
import { CacheType, Client, CommandInteraction, Interaction, MessageEmbed, Role } from 'discord.js';
import logger from '../../lib/logger';
import { Command } from '../common/command';
import { Widget } from '../common/widget';

const buttonIds = {
    toggle: 'toggle',
    voice: 'voice',
    reload: 'reload',
    info: 'info'
};

let widgets: Widget[] = [];

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
            await interaction.reply({ ephemeral: true, content: 'Unable to complete request' });
            return;
        }
        const [buttonId] = interaction.customId.split('-');
        const guild = interaction.guild;

        await interaction.channel.messages.fetch(interaction.message.id)
            .then((message) => new Promise<Widget>((res) => {
                // Check if widget entry exists for this widget, create if not
                const widget = widgets.find((widget) => widget.getId() === interaction.message.id);
                if (!widget) {
                    new Widget(message, guild, [], (widget) => {
                        widgets.push(widget);
                        res(widget);
                    }, (widget) => widgets = widgets.filter((w) => w.getId() !== widget.getId()));
                } else {
                    res(widget);
                }
            }))
            .then(async (widget) => {
                logger.log(buttonId + '-button pressed on widget ' + widget.getId());
                switch (buttonId) {
                    case buttonIds.toggle:
                        await widget.toggle(interaction);
                        break;
                    case buttonIds.voice:
                        await widget.toggleVoice(interaction);
                        break;
                    case buttonIds.reload:
                        widget.recreateMessage(true);
                        break;
                    case buttonIds.info:
                        interaction.reply({
                            ephemeral: true,
                            embeds: [new MessageEmbed({
                                title: 'Widget Info',
                                description: 'Button 1 - Starts/Stops Text Updates\n' +
                                    'Button 2 - Starts/Stops Audio Updates\n' +
                                    'Button 3 - Reloads the Widget\n' +
                                    'Button 4 - Sends Widget Info\n\n' +
                                    'Respawn Timer Data Source: https://respawntimer.com\n' + 
                                    'Support: Dennis D. Grees#4778'
                            })]
                        });
                        break;
                }
            })
            .catch(async () => {
                await interaction.reply({ ephemeral: true, content: 'Unable to fetch the message' });
            });
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
            .addRoleOption((option) => option
                .setName('managerrole2')
                .setDescription('This role is allowed to manage the timer')
                .setRequired(false))
            .addRoleOption((option) => option
                .setName('managerrole3')
                .setDescription('This role is allowed to manage the timer')
                .setRequired(false))
            .toJSON();
    }
    // eslint-disable-next-line @typescript-eslint/require-await
    public async execute(interaction: CommandInteraction<CacheType>): Promise<void> {
        const roles = [
            interaction.options.getRole('managerrole'),
            interaction.options.getRole('managerrole2'),
            interaction.options.getRole('managerrole3')
        ].filter((role): role is Role => !!role);
        const channel = interaction.options.getChannel('channel') ?? interaction.channel;
        const guild = interaction.guild;
        if (!guild) {
            await interaction.reply('This cannot be used in DMs');
            return;
        }
        if (channel?.type !== 'GUILD_TEXT') {
            await interaction.reply({ ephemeral: true, content: 'Invalid channel' });
            return;
        }

        channel.send({
            embeds: [new MessageEmbed({
                title: 'Respawn Timer',
            })]
        }).then((message) => {
            new Widget(message, guild, roles, async (widget) => {
                widgets.push(widget);
                await interaction.reply({
                    ephemeral: true,
                    content: 'Widget created.'
                });
            }, (widget) => widgets = widgets.filter((w) => w.getId() !== widget.getId()));
        });
    }
}
