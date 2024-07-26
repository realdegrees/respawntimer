/* eslint-disable max-lines */
import {
    EmbedBuilder, Client, Guild, User, ButtonInteraction, CacheType,
    ChannelSelectMenuInteraction, MentionableSelectMenuInteraction, ModalSubmitInteraction,
    RoleSelectMenuInteraction, StringSelectMenuInteraction, UserSelectMenuInteraction
} from 'discord.js';
import logger from '../lib/logger';
import { Widget } from './common/widget';
import { SETTINGS_LIST, openSettings } from './commands/settings';
import { deleteGuild, getGuild } from './db/guild.schema';
import { WARTIMER_INTERACTION_SPLIT, WARTIMER_INTERACTION_ID, WARTIMER_ICON_LINK, EXCLAMATION_ICON_LINK as EXCLAMATION_ICON_LINK } from './common/constant';
import { EInteractionType } from './common/types/interactionType';
import { ESettingsID, Setting } from './common/settings/settings';
import { ERaidhelperSettingsOptions, RaidhelperSettings } from './common/settings/raidhelper.settings';
import raidhelperIntegration from './raidhelperIntegration';
import { EPermissionSettingsOptions } from './common/settings/permissions.settings';
import { EMiscSettingsOptions } from './common/settings/misc.settings';
import audioManager, { Voices } from './util/audioManager';
import { ENotificationSettingsOptions } from './common/settings/notifications.settings';
import { checkChannelPermissions } from './util/checkChannelPermissions';

const widgetButtonIds = {
    text: 'text',
    voice: 'voice',
    settings: 'settings',
    info: 'info'
};

export class InteractionHandler {
    public constructor(client: Client) {
        client.on('interactionCreate', interaction => {
            if (interaction.isCommand() || !interaction.isRepliable()) return;
            // Splits the custom id of the interaction component into several parts
            const [wartimerId, interactionType, interactionId, interactionOption] = interaction.customId.split(WARTIMER_INTERACTION_SPLIT);
            const interactionArgs = interaction.customId.split(WARTIMER_INTERACTION_SPLIT).slice(4, interaction.customId.length - 1);
            // If the first part of the ID is not the wartimer id it is not an interaction with the current version of this bot
            if (wartimerId != WARTIMER_INTERACTION_ID) {
                // If the id doesn't match but the original mesage is from this bot then it might be an old widget
                if (interaction.message && interaction.message.author === client.user) {
                    interaction.reply({ ephemeral: true, content: '**Detected Legacy Widget**\nPlease create a new widget with `/create`' })
                        .then(() => interaction.message?.delete())
                        .catch(logger.error);
                }
                return;
            }
            this.onInteraction(interaction, interactionType, interactionId, interactionOption, interactionArgs)
                .catch((e) => interaction.reply({ ephemeral: true, content: e?.toString() }))
                .catch(logger.error);
        });
    }

    private async onInteraction(
        interaction:
            StringSelectMenuInteraction<CacheType> |
            UserSelectMenuInteraction<CacheType> |
            RoleSelectMenuInteraction<CacheType> |
            MentionableSelectMenuInteraction<CacheType> |
            ChannelSelectMenuInteraction<CacheType> |
            ButtonInteraction<CacheType> |
            ModalSubmitInteraction<CacheType>,
        type: string,
        id: string,
        option: string,
        args: string[]
    ): Promise<unknown> {
        if (!interaction.channel) {
            return;
        }

        if (!interaction.guild) {
            return Promise.reject('Unable to complete request! Cannot retrieve server data');
        }

        const guild = interaction.guild;


        logger.debug('Trying to find guild in db');
        const dbGuild = await getGuild(guild);
        logger.debug(`DB obj: ${JSON.stringify(dbGuild.toJSON())}`);
        logger.debug('ID: ' + id);
        logger.debug('TYPE: ' + type);


        if (type === EInteractionType.WIDGET) {
            logger.log('Widget interaction');
            return interaction.message?.fetch()
                // eslint-disable-next-line no-async-promise-executor
                .then(Widget.get)
                .then(async (widget) => {
                    logger.info('[' + guild.name + '][Button] ' + id + ' activated by ' +
                        interaction.user.username);
                    switch (id) {
                        case widgetButtonIds.text:
                            return this.checkPermission(
                                guild,
                                interaction.user,
                                dbGuild.editorRoleIDs
                            ).then(async (perm) => {
                                if (!perm) {
                                    await interaction.reply({
                                        ephemeral: true,
                                        content: 'You do not have permission to use this.'
                                    });
                                    return;
                                } else {
                                    return widget.toggleText(interaction as ButtonInteraction)
                                        .then(() => interaction.deferUpdate());
                                }
                            });
                        case widgetButtonIds.voice:
                            return this.checkPermission(
                                guild,
                                interaction.user,
                                dbGuild.editorRoleIDs
                            ).then(async (perm) => {
                                if (!perm) {
                                    await interaction.reply({
                                        ephemeral: true,
                                        content: 'You do not have permission to use this.'
                                    });
                                    return;
                                } else {
                                    return widget.toggleVoice({
                                        voice: dbGuild.voice,
                                        interaction: interaction as ButtonInteraction
                                    }).then(() => interaction.deferUpdate());
                                }
                            });
                        case widgetButtonIds.settings:
                            return this.checkPermission(
                                guild,
                                interaction.user,
                                dbGuild.editorRoleIDs
                            ).then(async (perm) => {
                                if (!perm) {
                                    await interaction.reply({
                                        ephemeral: true,
                                        content: 'You do not have editor permissions.'
                                    });
                                    return;
                                } else {
                                    return openSettings(interaction as ButtonInteraction);
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
                });
        }
        if (type === EInteractionType.SETTING) {
            logger.log('Setting interaction');
            logger.log('Args: ' + args.toString());

            let setting: Setting | undefined;
            SETTINGS_LIST.find((row) => setting = row.find((setting) => setting.id === id));
            if (!setting) {
                return Promise.reject('**Detected Legacy Widget**\nPlease create a new widget with `/create`');
            }

            if (!option) {
                // No args = subsetting button was pressed -> open a subsetting menu
                logger.debug('Sending sub settings menu');
                return setting.send(interaction, dbGuild);
            }

            switch (id) {
                case ESettingsID.PERMISSIONS:
                    switch (option) {
                        case EPermissionSettingsOptions.EDITOR:
                            if (!interaction.isRoleSelectMenu()) return;
                            dbGuild.editorRoleIDs = interaction.roles.map((role) => role.id);
                            break;
                        case EPermissionSettingsOptions.ASSISTANT:
                            if (!interaction.isRoleSelectMenu()) return;
                            dbGuild.assistantRoleIDs = interaction.roles.map((role) => role.id);
                            break;
                    }
                    return dbGuild.save().then(() => setting!.send(interaction, dbGuild, { update: true }));
                case ESettingsID.VOICE:
                    if (!interaction.isStringSelectMenu()) return;
                    dbGuild.voice = interaction.values[0] as Voices;
                    audioManager.setVoice(guild.id, dbGuild.voice);
                    return dbGuild.save().then(() => setting!.send(interaction, dbGuild, { update: true }));
                case ESettingsID.RAIDHELPER:
                    switch (option) {
                        case ERaidhelperSettingsOptions.API_KEY:
                            if (interaction.isButton()) {
                                return (setting as RaidhelperSettings).showModal(interaction);
                            } else if (interaction.isModalSubmit()) {
                                const apiKey = interaction.fields
                                    .getTextInputValue(
                                        setting.getCustomId(
                                            ESettingsID.RAIDHELPER,
                                            [ERaidhelperSettingsOptions.API_KEY]
                                        ));
                                return raidhelperIntegration.checkApiKey(guild, apiKey)
                                    .then((valid) => {
                                        if (valid) {
                                            logger.log('setting api key');
                                            dbGuild.raidHelper.apiKey = apiKey;
                                        } else {
                                            return Promise.reject('Invalid API Key');
                                        }
                                    })
                                    .then(() => dbGuild.save())
                                    .then(() => setting!.send(interaction, dbGuild, { update: true }));
                            }
                            break;
                        case ERaidhelperSettingsOptions.DEFAULT_CHANNEL:
                            if (!interaction.isChannelSelectMenu()) return;
                            return guild.channels.fetch(interaction.values[0])
                                .then((channel) => {
                                    if (!channel || !channel.isVoiceBased()) {
                                        return Promise.reject('Invalid Channel');
                                    } else {
                                        return checkChannelPermissions(channel, ['ViewChannel', 'Connect', 'Speak'])
                                            .then(() => {
                                                logger.debug('Valid Channel');
                                                dbGuild.raidHelper.defaultVoiceChannelId = interaction.values[0];
                                            })
                                            .then(() => dbGuild.save())
                                            .then(() => setting!.send(interaction, dbGuild, { update: true }));
                                    }
                                });
                        case ERaidhelperSettingsOptions.EVENT_CHANNEL:
                            if (!interaction.isChannelSelectMenu()) return;
                            return guild.channels.fetch(interaction.values[0])
                                .then((channel) => {
                                    if (!channel || !channel.isTextBased()) {
                                        return Promise.reject('Invalid Channel');
                                    } else {
                                        return checkChannelPermissions(channel, ['ViewChannel'])
                                            .then(() => {
                                                logger.debug('Valid Channel');
                                                dbGuild.raidHelper.eventChannelId = interaction.values[0];
                                            })
                                            .then(() => dbGuild.save())
                                            .then(() => setting!.send(interaction, dbGuild, { update: true }));
                                    }
                                });
                        case ERaidhelperSettingsOptions.TOGGLE:
                            dbGuild.raidHelper.enabled = !dbGuild.raidHelper.enabled;
                            return dbGuild.save().then(() => setting!.send(interaction, dbGuild, { update: true }));
                    }
                    break;
                case ESettingsID.MISC:
                    switch (option) {
                        case EMiscSettingsOptions.CLEAR:
                            return deleteGuild(guild)
                                .then(() => interaction.reply({ ephemeral: true, content: 'Data deleted ✅' }));
                        default:
                            break;
                    }
                    break;
                case ESettingsID.NOTIFICATIONS:
                    switch (option) {
                        case ENotificationSettingsOptions.UPDATE_CHANNEL:
                            if (!interaction.isChannelSelectMenu()) return;
                            return guild.channels.fetch(interaction.values[0])
                                .then((channel) => {
                                    if (!channel || !channel.isTextBased()) {
                                        return Promise.reject('Invalid Channel');
                                    } else {
                                        return checkChannelPermissions(channel, ['ViewChannel', 'SendMessages'])
                                            .then(() => {
                                                logger.debug('Valid Channel');
                                                dbGuild.notificationChannelId = interaction.values[0];
                                                return channel.send({
                                                    embeds: [new EmbedBuilder()
                                                        .setAuthor({
                                                            iconURL: EXCLAMATION_ICON_LINK,
                                                            name: 'Wartimer Notifications'
                                                        })
                                                        .setThumbnail(WARTIMER_ICON_LINK)
                                                        .setDescription('This channel will now receive bot update notifications!')]
                                                });
                                            })
                                            .then(() => dbGuild.save())
                                            .then(() => setting!.send(interaction, dbGuild, { update: true }));
                                    }
                                });
                        default:
                            break;
                    }
                    break;
                default:
                    return Promise.reject('Could not complete request');
            }
        }

    }
    private async checkPermission(guild: Guild, user: User, permittedRoleIDs: string[]): Promise<boolean> {
        return guild.members.fetch(user)
            .then((member) => permittedRoleIDs.length === 0 ||
                member.roles.cache
                    .some((userRole) =>
                        permittedRoleIDs.includes(userRole.id)) ||
                member.permissions.has('Administrator') ||
                user.id === process.env['OWNER_ID']);
    }
}