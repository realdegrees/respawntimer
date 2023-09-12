/* eslint-disable max-len */
import { SlashCommandBuilder } from '@discordjs/builders';
import { RESTPostAPIApplicationCommandsJSONBody } from 'discord-api-types/v9';
import { CacheType, ChannelType, Client, CommandInteraction, CommandInteractionOptionResolver, TextBasedChannel } from 'discord.js';
import { Command } from '../common/command';
import { Widget } from '../common/widget';




export class Create extends Command {
    public constructor(protected client: Client) {
        super('create', 'Creates a wartimer widget in the current channel', client);
    }

    public build(): RESTPostAPIApplicationCommandsJSONBody {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(this.description)
            .toJSON();
    }
    // eslint-disable-next-line @typescript-eslint/require-await
    public async execute(interaction: CommandInteraction<CacheType> & { options: Pick<CommandInteractionOptionResolver<CacheType>, 'getRole' | 'getChannel'> }): Promise<void> {

        this.checkPermission(interaction, 'editor').then(() => {
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
            return Widget.create(interaction, guild, channel);
        }).catch(async (msg) => {
            await interaction.reply({
                ephemeral: true,
                content: msg.toString()
            });
        });


    }
}
