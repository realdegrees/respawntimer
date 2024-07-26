/* eslint-disable max-len */
import { SlashCommandBuilder } from '@discordjs/builders';
import { RESTPostAPIApplicationCommandsJSONBody } from 'discord-api-types/v9';
import { CacheType, ChannelType, Client, CommandInteraction, CommandInteractionOptionResolver, EmbedBuilder, Interaction, Role, TextBasedChannel } from 'discord.js';
import logger from '../../lib/logger';
import { Command } from '../common/command';
import { Widget } from '../common/widget';

const buttonIds = {
    text: 'text',
    voice: 'voice',
    //  reload: 'reload',
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

        await interaction.message.fetch()
            // eslint-disable-next-line no-async-promise-executor
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
                logger.info('[' + guild.name + '][Button] ' + buttonId + ' activated by ' + interaction.user.username);
                switch (buttonId) {
                    case buttonIds.text:
                        await widget.toggleText(interaction);
                        break;
                    case buttonIds.voice:
                        await widget.toggleVoice(interaction);
                        break;
                    case buttonIds.info:
                        await interaction.reply({
                            ephemeral: true,
                            embeds: [new EmbedBuilder()
                                .setTitle('Widget Info')
                                .setDescription('- The bot will automatically disconnect after every war if it has been running for more than 15 minutes\n' +
                                    '- (Not implemented) The bot will automatically join any channel it has permission in when a war starts and over 40 users are connected to that channel\n' +
                                    '- If the text widget reloads too often increase the interval with /set delay')]
                        });
                        break;
                }
            })
            .catch(async () => {
                if (!interaction.deferred) {
                    await interaction.reply({ ephemeral: true, content: 'Something went wrong :(' });
                }
            })
            .catch(() => {
                logger.error('[' + interaction.guild?.name + '] Fatal Error. Unable to reply to user!'); 
            });
    }
    public build(): RESTPostAPIApplicationCommandsJSONBody {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(this.description)
            .addChannelOption((option) => option
                .setName('channel')
                .setDescription('The text-channel where the timer widget will be posted')
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
    public async execute(interaction: CommandInteraction<CacheType> & { options: Pick<CommandInteractionOptionResolver<CacheType>, 'getRole' | 'getChannel'> }): Promise<void> {
        const channel = interaction.options.getChannel('channel') as TextBasedChannel | null ?? interaction.channel;
        const guild = interaction.guild;
        if (!guild) {
            interaction.reply('This cannot be used in DMs');
            return;
        }
        if (!channel || channel.type !== ChannelType.GuildText) {
            interaction.reply({ ephemeral: true, content: 'Invalid channel' });
            return;
        } 
        
        return interaction.guild.members.fetch(interaction.user)
        .then((member) => {
            if (!member.permissions.has('Administrator')) {
                throw new Error('You must have administrator permissions to use this command!');
            }
        }).then(async () => {
            const roles = [
                interaction.options.getRole('managerrole'),
                interaction.options.getRole('managerrole2'),
                interaction.options.getRole('managerrole3')
            ].filter((role): role is Role => !!role);
            
            await interaction.deferReply({ ephemeral: true });
            channel.send({
                embeds: [new EmbedBuilder().setTitle('Respawn Timer')]
            }).then((message) => {
                new Widget(message, guild, roles, async (widget) => {
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
}
