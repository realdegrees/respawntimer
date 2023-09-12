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
            const [wartimerId, interactionType, interactionId, interactionOption] = interaction.customId.split(WARTIMER_INTERACTION_SPLIT);
            const interactionArgs = interaction.customId.split(WARTIMER_INTERACTION_SPLIT).slice(4, interaction.customId.length - 1);
            if (wartimerId != WARTIMER_INTERACTION_ID) {
                if (interaction.message?.author === client.user) {
                    interaction.message.delete().then(() => {
                        interaction.reply({ ephemeral: true, content: '**Detected Legacy Widget**\nPlease create a new widget with `/create`' });
                    }).catch(logger.error);
                }
                return;
            }
            this.onInteraction(interaction, interactionType, interactionId, interactionOption, interactionArgs)
                .catch((e) =>
                    interaction.reply({ ephemeral: true, content: e.toString() }).catch(logger.error)
                );
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
    ): Promise<void> {
        if (!interaction.channel) {
            return;
        }

        if (!interaction.guild) {
            await interaction.reply({ ephemeral: true, content: 'Unable to complete request' }).catch(logger.error);
            return;
        }

        const guild = interaction.guild;


        logger.debug('Trying to find guild in db');
        const dbGuild = await getGuild(guild);
        logger.debug(`DB obj: ${JSON.stringify(dbGuild.toJSON())}`);
        logger.debug('ID: ' + id);
        logger.debug('TYPE: ' + type);


        if (type === EInteractionType.WIDGET) {
            logger.log('Widget interaction');
            await interaction.message?.fetch()
                // eslint-disable-next-line no-async-promise-executor
                .then(Widget.get)
                .then(async (widget) => {
                    logger.info('[' + guild.name + '][Button] ' + id + ' activated by ' +
                        interaction.user.username);
                    switch (id) {
                        case widgetButtonIds.text:
                            if (!await this.checkPermission(
                                guild,
                                interaction.user,
                                [...dbGuild.editorRoleIDs, ...dbGuild.assistantRoleIDs]
                            )) {
                                await interaction.reply({
                                    ephemeral: true,
                                    content: 'You do not have the necessary permissions.'
                                }).catch(logger.error);
                                return;
                            }
                            await widget.toggleText(interaction as ButtonInteraction).finally(() =>
                                interaction.deferUpdate()
                            ).catch(logger.error);
                            break;
                        case widgetButtonIds.voice:
                            if (!await this.checkPermission(
                                guild,
                                interaction.user,
                                [...dbGuild.editorRoleIDs, ...dbGuild.assistantRoleIDs]
                            )) {
                                await interaction.reply({
                                    ephemeral: true,
                                    content: 'You do not have the necessary permissions.'
                                }).catch(logger.error);
                                return;
                            }
                            await widget.toggleVoice({
                                voice: dbGuild.voice,
                                interaction: interaction as ButtonInteraction
                            })
                                .then(() => interaction.deferUpdate())
                                .catch((e) => interaction.reply({
                                    ephemeral: true,
                                    content: e.toString()
                                })).catch(logger.error);
                            break;
                        case widgetButtonIds.settings:
                            if (!await this.checkPermission(
                                guild,
                                interaction.user,
                                dbGuild.editorRoleIDs
                            )) {
                                await interaction.reply({
                                    ephemeral: true,
                                    content: 'You do not have editor permissions.'
                                }).catch(logger.error);
                                return;
                            }
                            await openSettings(interaction as ButtonInteraction);
                            break;
                        case widgetButtonIds.info:
                            await interaction.reply({
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
                            }).catch(logger.error);
                            break;
                    }
                })
                .catch(async () => {
                    if (!interaction.deferred) {
                        await interaction.reply({ ephemeral: true, content: 'Something went wrong :(' }).catch(logger.error);
                    }
                })
                .catch(() => {
                    logger.error('[' + interaction.guild?.name + '] Fatal Error. Unable to reply to user!');
                });
        }
        if (type === EInteractionType.SETTING) {
            logger.log('Setting interaction');
            logger.log('Args: ' + args.toString());

            let setting: Setting | undefined;
            SETTINGS_LIST.find((row) => setting = row.find((setting) => setting.id === id));
            if (!setting) {
                await interaction.reply({ ephemeral: true, content: '**Detected Legacy Widget**\nPlease create a new widget with `/create`' }).catch(logger.error);
                return;
            }

            if (!option) {
                // No args = subsetting button was pressed -> open a subsetting menu
                logger.debug('Sending sub settings menu');
                await setting
                    .send(interaction, dbGuild)
                    .catch((e) => logger.error(e));
                return;
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
                    break;
                case ESettingsID.VOICE:
                    if (!interaction.isStringSelectMenu()) return;
                    dbGuild.voice = interaction.values[0] as Voices;
                    audioManager.setVoice(guild.id, dbGuild.voice);
                    break;
                case ESettingsID.RAIDHELPER:
                    switch (option) {
                        case ERaidhelperSettingsOptions.API_KEY:
                            if (interaction.isButton()) {
                                await (setting as RaidhelperSettings).showModal(interaction);
                                return;
                            } else if (interaction.isModalSubmit()) {
                                const apiKey = interaction.fields
                                    .getTextInputValue(
                                        setting.getCustomId(
                                            ESettingsID.RAIDHELPER,
                                            [ERaidhelperSettingsOptions.API_KEY]
                                        ));
                                await raidhelperIntegration.checkApiKey(guild, apiKey)
                                    .then((valid) => {
                                        if (valid) {
                                            logger.log('setting api key');
                                            dbGuild.raidHelper.apiKey = apiKey;
                                        } else {
                                            throw new Error('Invalid API Key');
                                        }
                                    });
                            }
                            break;
                        case ERaidhelperSettingsOptions.DEFAULT_CHANNEL:
                            if (interaction.isChannelSelectMenu()) {
                                const channel = await guild.channels.fetch(interaction.values[0])
                                    .catch(() => undefined);

                                if (!channel || !channel.isVoiceBased()) {
                                    await interaction.reply({ ephemeral: true, content: 'Invalid Channel' }).catch(logger.error);
                                    return;
                                } else {
                                    await checkChannelPermissions(channel, ['ViewChannel', 'Connect', 'Speak']).then(() => {
                                        logger.debug('Valid Channel');
                                        dbGuild.raidHelper.defaultVoiceChannelId = interaction.values[0];
                                    }).catch(async (e) => {
                                        logger.debug('Invalid Channel');
                                        await interaction.reply({ ephemeral: true, content: e.toString() })
                                            .catch(logger.error);
                                    });
                                }
                            }
                            break;
                        case ERaidhelperSettingsOptions.EVENT_CHANNEL:
                            if (interaction.isChannelSelectMenu()) {
                                const channel = await guild.channels.fetch(interaction.values[0])
                                    .catch(() => undefined);

                                if (!channel || !channel.isTextBased()) {
                                    await interaction.reply({ ephemeral: true, content: 'Invalid Channel' }).catch(logger.error);
                                    return;
                                } else {
                                    await checkChannelPermissions(channel, ['ViewChannel']).then(() => {
                                        logger.debug('Valid Channel');
                                        dbGuild.raidHelper.eventChannelId = interaction.values[0];
                                    }).catch(async (e) => {
                                        logger.debug('Invalid Channel');
                                        await interaction.reply({ ephemeral: true, content: e.toString() })
                                            .catch(logger.error);
                                    });
                                }
                            }
                            break;
                        case ERaidhelperSettingsOptions.TOGGLE:
                            dbGuild.raidHelper.enabled = !dbGuild.raidHelper.enabled;
                            break;
                    }
                    break;
                case ESettingsID.MISC:
                    switch (option) {
                        case EMiscSettingsOptions.CLEAR:
                            await deleteGuild(guild).then(() => interaction.reply({ ephemeral: true, content: 'Data deleted ✅' })).catch(logger.error);
                            return;
                        default:
                            break;
                    }
                    break;
                case ESettingsID.NOTIFICATIONS:
                    switch (option) {
                        case ENotificationSettingsOptions.UPDATE_CHANNEL:
                            if (interaction.isChannelSelectMenu()) {
                                const channel = await guild.channels.fetch(interaction.values[0])
                                    .catch(() => undefined);

                                if (dbGuild.notificationChannelId === interaction.values[0]) {
                                    await interaction.deferUpdate().catch(logger.error);
                                    return;
                                } else if (!channel || !channel.isTextBased()) {
                                    await interaction.reply({ ephemeral: true, content: 'Invalid Channel' }).catch(logger.error);
                                    return;
                                } else {
                                    await checkChannelPermissions(channel, ['ViewChannel', 'SendMessages']).then(() => {
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
                                    }).catch(async (e) => {
                                        await interaction.reply({ ephemeral: true, content: e.toString() }).catch(logger.error);
                                    });
                                }
                            }
                            break;
                        default:
                            break;
                    }
                    break;
                default:
                    logger.debug('no id, deferring and deleting');
                    await interaction.deferUpdate().then(() => interaction.deleteReply()).catch(logger.error);
                    return;
            }
            await dbGuild.save()
                .then((obj) => {
                    logger.debug('dbGuild saved: ' + JSON.stringify(obj));
                    // TODO: keep an eye on this, maybe need to check for replied and deferred again before sending
                    setting!.send(interaction, dbGuild, {
                        update: true
                    });

                }).catch((e) => logger.error(e));
        }

    }
    private async checkPermission(guild: Guild, user: User, permittedRoleIDs: string[]): Promise<boolean> {
        const member = await guild.members.fetch(user);
        return permittedRoleIDs.length === 0 || member.roles.cache
            .some((userRole) =>
                permittedRoleIDs.includes(userRole.id)) ||
            member.permissions.has('Administrator');
    }
}