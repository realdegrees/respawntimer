import {
    EmbedBuilder, Client, Guild, User, ButtonInteraction, CacheType,
    ChannelSelectMenuInteraction, MentionableSelectMenuInteraction, ModalSubmitInteraction,
    RoleSelectMenuInteraction, StringSelectMenuInteraction, UserSelectMenuInteraction
} from 'discord.js';
import logger from '../../lib/logger';
import { Widget } from '../common/widget';
import { SETTINGS_LIST, openSettings } from '../commands/settings';
import { Voices } from '../common/types';
import { getGuild } from '../db/guild.schema';
import { WARTIMER_INTERACTION_SPLIT, WARTIMER_INTERACTION_ID } from '../common/constant';
import { EInteractionType } from '../common/types/interactionType';
import { ESettingsID, Setting } from '../common/settings/settings';
import { ERaidhelperSettingsOptions, RaidhelperSettings } from '../common/settings/raidhelper.settings';
import raidhelperIntegration from './raidhelperIntegration';

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
                    });
                }
                return;
            }
            this.onInteraction(interaction, interactionType, interactionId, interactionOption, interactionArgs)
                .catch((e) =>
                    interaction.reply({ ephemeral: true, content: e.toString() })
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
            await interaction.reply({ ephemeral: true, content: 'Unable to complete request' });
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
                                });
                                return;
                            }
                            await widget.toggleText(interaction as ButtonInteraction);
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
                                });
                                return;
                            }
                            await widget.toggleVoice(dbGuild.voice, interaction as ButtonInteraction);
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
                                });
                                return;
                            }
                            await openSettings(interaction as ButtonInteraction);
                            break;
                        case widgetButtonIds.info:
                            await interaction.reply({
                                ephemeral: true,
                                embeds: [new EmbedBuilder()
                                    .setAuthor({ iconURL: 'https://cdn3.emoji.gg/emojis/2637-settings.png', name: 'Wartimer' })
                                    .setThumbnail('https://cdn.discordapp.com/avatars/993116789284286484/c5d1f8c2507c7f2a56a2a330109e66d2?size=1024')
                                    .setFooter({
                                        text: 'If the bot is offline please contact dennisgrees on discord',
                                        iconURL: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/39/Orange_exclamation_mark.svg/240px-Orange_exclamation_mark.svg.png'
                                    })
                                    .setTitle('Github')
                                    .setURL('https://github.com/realdegrees/wartimer')
                                    // eslint-disable-next-line max-len
                                    .setDescription('If you require assistance with the bot or have suggestions for improvements feel free to open an issue on the github repo linked above.')]
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
        if (type === EInteractionType.SETTING) {
            logger.log('Setting interaction');
            logger.log('Args: ' + args.toString());

            const setting: Setting | undefined = SETTINGS_LIST.find((setting) => setting.id === id);
            if (!setting) {
                await interaction.reply({ ephemeral: true, content: '**Detected Legacy Widget**\nPlease create a new widget with `/create`' });
                return;
            }

            if (!option) {
                // No args = subsetting button was pressed -> open a subsetting menu
                await setting
                    .send(interaction, dbGuild)
                    .catch((e) => logger.error(e));
                return;
            }

            switch (id) {
                case ESettingsID.EDITOR:
                    if (!interaction.isRoleSelectMenu()) return;
                    dbGuild.editorRoleIDs = interaction.roles.map((role) => role.id);
                    break;
                case ESettingsID.ASSISTANT:
                    if (!interaction.isRoleSelectMenu()) return;
                    dbGuild.assistantRoleIDs = interaction.roles.map((role) => role.id);
                    break;
                case ESettingsID.VOICE:
                    if (!interaction.isStringSelectMenu()) return;
                    dbGuild.voice = interaction.values[0] as Voices;
                    break;
                case ESettingsID.RAIDHELPER:
                    switch (option) {
                        case ERaidhelperSettingsOptions.API_KEY:
                            if (interaction.isButton()) {
                                await (setting as RaidhelperSettings).showModal(interaction);
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
                                            setting.send(interaction, dbGuild, {
                                                includeDescription: false
                                            });
                                        } else {
                                            throw new Error('Invalid API Key');
                                        }
                                    });
                            }
                            break;
                        case ERaidhelperSettingsOptions.DEFAULT_CHANNEL:
                            if (interaction.isChannelSelectMenu()) {
                                dbGuild.raidHelper.defaultVoiceChannelId = interaction.values[0];
                            }
                            break;
                        case ERaidhelperSettingsOptions.TOGGLE:
                            dbGuild.raidHelper.enabled = !dbGuild.raidHelper.enabled;
                            break;
                    }
                    break;
                default:
                    await interaction.deferUpdate().then(() => interaction.deleteReply());
                    return;
            }
            await dbGuild.save()
                .then(() => {
                    if (!interaction.deferred && !interaction.replied) {
                        logger.log('Resending');
                        setting.send(interaction, dbGuild, {
                            includeDescription: false,
                            deleteOriginal: true
                        });
                    }
                })
                .catch((e) => logger.error(e));
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