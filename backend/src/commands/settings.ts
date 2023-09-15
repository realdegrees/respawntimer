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
import { EXCLAMATION_ICON_LINK, WARTIMER_ICON_LINK, WARTIMER_INTERACTION_ID, WARTIMER_INTERACTION_SPLIT } from '../common/constant';
import { EInteractionType } from '../common/types/interactionType';
import { MiscSettings } from '../common/settings/misc.settings';
import { NotificationSettings } from '../common/settings/notifications.settings';
import logger from '../../lib/logger';
import { TimingsSettings } from '../common/settings/timings.settings';

export const SETTINGS_LIST = [
    [
        new PermissionSettings(),
        new VoiceSettings(),
        new RaidhelperSettings(),
        new TimingsSettings()]
    , [
        new NotificationSettings(),
        new MiscSettings()
    ]];

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
    public async execute(interaction: CommandInteraction<CacheType>): Promise<unknown> {
        return this.checkPermission(interaction, 'editor').then(() =>
            openSettings(interaction)
        ).catch(async (msg) => interaction.reply({
                ephemeral: true,
                content: msg?.toString()
            })
        ).catch (logger.error);
    }
}
// eslint-disable-next-line max-len
export const openSettings = async (interaction: ButtonInteraction<CacheType> | CommandInteraction<CacheType>): Promise<unknown> => {
    const guild = interaction.guild;
    if (!guild) {
        return Promise.reject();
    }

    return interaction.reply({
        ephemeral: true, embeds: [new EmbedBuilder()
            .setAuthor({ iconURL: 'https://cdn3.emoji.gg/emojis/2637-settings.png', name: 'Settings' })
            .setThumbnail(WARTIMER_ICON_LINK)
            .setDescription(`Select a button below to edit a specific setting`)
            .setFooter({
                text: `If something doesn't work try clearing the bot data in 'Misc Settings'`,
                iconURL: EXCLAMATION_ICON_LINK
            })],
        components: SETTINGS_LIST.map((row) => new ActionRowBuilder()
            .setComponents(
                row.map((setting) => new ButtonBuilder({
                    label: setting.title,
                    style: setting.buttonStyle,
                    type: ComponentType.Button,
                    customId: [WARTIMER_INTERACTION_ID, EInteractionType.SETTING, setting.id].join(WARTIMER_INTERACTION_SPLIT)
                }))
            ) as ActionRowBuilder<any>)
    });
};

