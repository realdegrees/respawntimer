import { Interaction, EmbedBuilder, Client, Guild, User, ButtonInteraction } from 'discord.js';
import logger from '../lib/logger';
import { default as DBGuild } from './db/guild.schema';
import { Widget } from './common/widget';
import { openSettings, settingsIds } from './commands/settings';

const widgetButtonIds = {
    text: 'text',
    voice: 'voice',
    settings: 'settings',
    info: 'info'
};


export class InteractionHandler {
    public constructor(client: Client) {
        client.on('interactionCreate', interaction => {
            this.onInteraction(interaction);
        });
    }
    private async onInteraction(interaction: Interaction): Promise<void> {
        if (!interaction.isButton() && !interaction.isRoleSelectMenu() || !interaction.channel) {
            return;
        }

        if (!interaction.guild) {
            await interaction.reply({ ephemeral: true, content: 'Unable to complete request' });
            return;
        }
        const [interactionTypeId] = interaction.customId.split('-');
        const guild = interaction.guild;

        logger.debug('Trying to find guild in db');
        const dbGuild = await DBGuild.findById(guild.id).then((obj) => obj ?? new DBGuild({
            _id: guild.id,
            name: guild.name,
            assistantRoleIDs: [],
            editorRoleIDs: []
        }).save());
        logger.debug(`DB obj: ${JSON.stringify(dbGuild.toJSON())}`);
        logger.debug(interactionTypeId);
        const isWidgetButton = Object.values(widgetButtonIds).includes(interactionTypeId);
        const isSetting = Object.values(settingsIds).includes(interactionTypeId);
        if (isWidgetButton) {
            await interaction.message.fetch()
                // eslint-disable-next-line no-async-promise-executor
                .then(Widget.get)
                .then(async (widget) => {
                    logger.info('[' + guild.name + '][Button] ' + interactionTypeId + ' activated by ' +
                        interaction.user.username);
                    switch (interactionTypeId) {
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
                            await widget.toggleVoice(interaction as ButtonInteraction);
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
        } else if (isSetting) {
            if (interaction.isRoleSelectMenu()) {
                switch (interactionTypeId) {
                    case settingsIds.editor:
                        dbGuild.editorRoleIDs = interaction.roles.map((role) => role.id);
                        break;
                    case settingsIds.assistant:
                        dbGuild.assistantRoleIDs = interaction.roles.map((role) => role.id);
                        break;
                    default:
                        break;
                }
                dbGuild.save().then(() => interaction.deferUpdate().catch((e) => logger.error(e)));
            }
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