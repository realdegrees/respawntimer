import { SlashCommandBuilder } from '@discordjs/builders';
import { RESTPostAPIApplicationCommandsJSONBody } from 'discord-api-types/v9';
import { CacheType, Client, CommandInteraction } from 'discord.js';
import { Command } from '../common/command';
import settings from '../common/applicationSettings';


export class CommandSet extends Command {
    public constructor(protected client: Client) {
        super('set', 'Change Bot Settings', client);
    }
    public build(): RESTPostAPIApplicationCommandsJSONBody {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(this.description)
            .addIntegerOption((option) => option
                .setName('delay')
                .setDescription('Changes the update interval of the respawn timer (Default: 1)')
                .setRequired(false))
            .toJSON();
    }
    // eslint-disable-next-line @typescript-eslint/require-await
    public async execute(interaction: CommandInteraction<CacheType>): Promise<void> {
        const delay = interaction.options.getInteger('delay') ?? undefined;
        if (interaction.guild?.id) {
            settings.update(interaction.guild.id, { delay });
            interaction.reply({ ephemeral: true, content: 'Updated Settings.' });
        } else {
            interaction.reply('Failed to update settings');
        }
    }
}
