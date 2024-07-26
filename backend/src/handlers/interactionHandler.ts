/* eslint-disable max-lines */
import {
    EmbedBuilder, Client, Guild, User, ButtonInteraction, CacheType,
    ChannelSelectMenuInteraction, MentionableSelectMenuInteraction, ModalSubmitInteraction,
    RoleSelectMenuInteraction, StringSelectMenuInteraction, UserSelectMenuInteraction, ButtonBuilder, ChannelSelectMenuBuilder, RoleSelectMenuBuilder, StringSelectMenuBuilder
} from 'discord.js';
import logger from '../../lib/logger';
import { Widget } from '../common/widget';
import { WARTIMER_INTERACTION_SPLIT, WARTIMER_INTERACTION_ID, WARTIMER_ICON_LINK, EXCLAMATION_ICON_LINK as EXCLAMATION_ICON_LINK } from '../common/constant';
import { EInteractionType } from '../common/types/interactionType';
import { BaseSetting } from '../common/settings/base.setting';
import { DBGuild } from '../common/types/dbGuild';
import Database from '../db/database';
import { setTimeout } from 'timers/promises';
import { SettingsHandler } from './settingsHandler';

const widgetButtonIds = {
    text: 'text',
    voice: 'voice',
    settings: 'settings',
    info: 'info'
};

export class InteractionHandler {
    public constructor(client: Client) {
        client.on('interactionCreate', async (interaction) => {
            if (interaction.isCommand() || !interaction.isRepliable()) return;
            // Splits the custom id of the interaction component into several parts
            const [wartimerId, interactionType, interactionId, interactionOption] = interaction.customId.split(WARTIMER_INTERACTION_SPLIT);
            const interactionArgs = interaction.customId.split(WARTIMER_INTERACTION_SPLIT).slice(4, interaction.customId.length - 1);
            // If the first part of the ID is not the wartimer id it is not an interaction with the current version of this bot
            if (wartimerId != WARTIMER_INTERACTION_ID) {
                // If the id doesn't match but the original mesage is from this bot then it might be an old widget
                if (interaction.message && interaction.message.author === client.user) {
                    await interaction.reply({ ephemeral: true, content: '**Detected Legacy Widget**\nPlease create a new widget with `/create`' })
                        .then(() => interaction.message?.delete())
                        .catch(logger.error);
                }
                return;
            }
            this.onInteraction(interaction, interactionType, interactionId, interactionOption, interactionArgs)
                .catch((err) => interaction.reply({ ephemeral: true, content: err?.toString?.() || 'Unknown Error' })
                    .then(() => setTimeout(15000))
                    .then(() => interaction.deleteReply()))
                .catch(logger.error);
        });
    }

    private async onInteraction(
        interaction:
            StringSelectMenuInteraction<CacheType> |
            UserSelectMenuInteraction<CacheType> |
            MentionableSelectMenuInteraction<CacheType> |
            RoleSelectMenuInteraction<CacheType> |
            ChannelSelectMenuInteraction<CacheType> |
            ButtonInteraction<CacheType> |
            ModalSubmitInteraction<CacheType>,
        type: string,
        id: string,
        option: string,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        args: string[]
    ): Promise<unknown> {
        if (!interaction.channel) {
            return;
        }
        if (!interaction.guild) {
            return Promise.reject('Unable to complete request! Cannot retrieve server data');
        }
        return Database.getGuild(interaction.guild).then(async (dbGuild) => {
            if (!interaction.guild) return Promise.reject('Unable to complete request! Cannot retrieve server data');
            const widget = await Widget.get({
                guild: interaction.guild,
                messageId: dbGuild.widget.messageId,
                channelId: dbGuild.widget.channelId
            }) ?? await Widget.get({ message: interaction.message ?? undefined });
            if (type === EInteractionType.WIDGET && interaction.isButton()) {
                return this.handleWidgetButtons(interaction, widget, dbGuild, id);
            }
        });
    }
    private async handleWidgetButtons(
        interaction: ButtonInteraction,
        widget: Widget | undefined,
        dbGuild: DBGuild,
        id: string
    ): Promise<unknown> {
        if (!widget) return Promise.reject('Unable to find widget for this interaction. This should not happen.');
        const combinedRoles = [...dbGuild.editorRoleIDs, ...dbGuild.assistantRoleIDs];
        switch (id) {
            case widgetButtonIds.text:
                return InteractionHandler.checkPermission(
                    interaction.guild!,
                    interaction.user,
                    combinedRoles
                ).then(async (perm) => {
                    if (!perm && combinedRoles.length > 0) {
                        return Promise.reject('You do not have permission to use this.');
                    } else {
                        return widget.toggleText({
                            dbGuild
                        }).then(() => interaction.deferUpdate());
                    }
                });
            case widgetButtonIds.voice:
                return InteractionHandler.checkPermission(
                    interaction.guild!,
                    interaction.user,
                    combinedRoles
                ).then(async (perm) => {
                    if (!perm && combinedRoles.length > 0) {
                        return Promise.reject('You do not have permission to use this.');
                    } else {
                        return widget.toggleVoice({
                            dbGuild,
                            interaction: interaction as ButtonInteraction
                        }).then(() => interaction.deferUpdate());
                    }
                });
            case widgetButtonIds.settings:
                return InteractionHandler.checkPermission(
                    interaction.guild!,
                    interaction.user,
                    dbGuild.editorRoleIDs
                ).then(async (perm_2) => {
                    if (!perm_2) {
                        return dbGuild.editorRoleIDs.length === 0 ?
                            Promise.reject('Editor permissions have not been set up yet!\nPlease ask someone with administrator permissions to add editor roles in the settings.') :
                            Promise.reject('You do not have editor permissions.');
                    } else {
                        return SettingsHandler.openSettings(interaction as ButtonInteraction);
                    }
                });
            case widgetButtonIds.info:
                return interaction.reply({
                    ephemeral: true,
                    embeds: [
                        new EmbedBuilder()
                            .setAuthor({ iconURL: WARTIMER_ICON_LINK, name: 'Wartimer' })
                            .setThumbnail('https://assets-global.website-files.com/6257adef93867e50d84d30e2/636e0a6a49cf127bf92de1e2_icon_clyde_blurple_RGB.png')
                            .setTitle('Discord')
                            .setURL('https://discord.gg/AzHDPVrBfn')
                            .setDescription('Join the discord to get assistance, discuss the bot or suggest new features'),
                        new EmbedBuilder()
                            .setAuthor({ iconURL: WARTIMER_ICON_LINK, name: 'Wartimer' })
                            .setThumbnail('https://cdn.pixabay.com/photo/2022/01/30/13/33/github-6980894_1280.png')
                            .setFooter({
                                text: 'If the bot is offline please contact dennisgrees on discord',
                                iconURL: EXCLAMATION_ICON_LINK
                            })
                            .setTitle('Github')
                            .setURL('https://github.com/realdegrees/wartimer')
                            // eslint-disable-next-line max-len
                            .setDescription('If you require assistance with the bot or have suggestions for improvements feel free to open an issue on the github repo linked above.')
                    ]
                });
            default:
                return Promise.reject('Could not complete request');
        }
    }

    public static async checkPermission(guild: Guild, user: User, permittedRoleIDs: string[]): Promise<boolean> {
        return guild.members.fetch(user)
            .then((member) => member.roles.cache.some((userRole) => permittedRoleIDs.includes(userRole.id)) ||
                member.permissions.has('Administrator') ||
                user.id === process.env['OWNER_ID']);
    }
}