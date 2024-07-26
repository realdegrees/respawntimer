/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable max-len */
import { SlashCommandBuilder } from '@discordjs/builders';
import { RESTPostAPIApplicationCommandsJSONBody } from 'discord-api-types/v9';
import { Command } from '../common/command';
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonInteraction,
    ButtonStyle,
    CacheType,
    Client,
    CommandInteraction,
    ComponentType,
    EmbedBuilder
} from 'discord.js';
import { PermissionSettings } from '../common/settings/permissions.settings';
import { VoiceSettings } from '../common/settings/voice.settings';
import { RaidhelperSettings } from '../common/settings/raidhelper.settings';
import { WARTIMER_INTERACTION_ID, WARTIMER_INTERACTION_SPLIT } from '../common/constant';
import { EInteractionType } from '../common/types/interactionType';

export const SETTINGS_LIST = [
    new PermissionSettings(),
    new VoiceSettings(),
    new RaidhelperSettings()
];

export class Settings extends Command {
    public constructor(protected client: Client) {
        super('settings', 'Change Bot Settings', client);
    }

    public build(): RESTPostAPIApplicationCommandsJSONBody {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(this.description)
            .toJSON();
    }
    // eslint-disable-next-line @typescript-eslint/require-await
    public async execute(interaction: CommandInteraction<CacheType>): Promise<void> {
        this.checkPermission(interaction, 'editor').then(() => {
            openSettings(interaction);
        }).catch(async (msg) => {
            await interaction.reply({
                ephemeral: true,
                content: msg
            });
        });
    }
}
// eslint-disable-next-line max-len
export const openSettings = async (interaction: ButtonInteraction<CacheType> | CommandInteraction<CacheType>): Promise<void> => {
    const guild = interaction.guild;
    if (!guild) {
        return Promise.reject();
    }

    await interaction.reply({
        ephemeral: true, embeds: [new EmbedBuilder()
            .setAuthor({ iconURL: 'https://cdn3.emoji.gg/emojis/2637-settings.png', name: 'Settings' })
            .setThumbnail('https://cdn.discordapp.com/avatars/993116789284286484/c5d1f8c2507c7f2a56a2a330109e66d2?size=1024')
            .setDescription(`Select a button below to edit a specific setting`)],
        components: [new ActionRowBuilder()
                .setComponents(
                    SETTINGS_LIST.map((setting) => new ButtonBuilder({
                        label: setting.title,
                        style: ButtonStyle.Primary,
                        type: ComponentType.Button,
                        customId: [WARTIMER_INTERACTION_ID, EInteractionType.SETTING, setting.id].join(WARTIMER_INTERACTION_SPLIT)
                    }))
                ) as ActionRowBuilder<any>]
    });
};

