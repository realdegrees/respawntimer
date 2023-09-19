import { ButtonInteraction, CacheType, CommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ComponentType, AnySelectMenuInteraction, InteractionCollector, ModalSubmitInteraction, ChannelSelectMenuInteraction, MentionableSelectMenuInteraction, RoleSelectMenuInteraction, StringSelectMenuInteraction, UserSelectMenuInteraction, Guild } from "discord.js";
import { WARTIMER_ICON_LINK, EXCLAMATION_ICON_LINK, WARTIMER_INTERACTION_ID, WARTIMER_INTERACTION_SPLIT } from "../common/constant";
import { MiscSettings } from "../common/settings/misc.settings";
import { NotificationSettings } from "../common/settings/notifications.settings";
import { PermissionSettings } from "../common/settings/permissions.settings";
import { RaidhelperSettings } from "../common/settings/raidhelper.settings";
import { TimingsSettings } from "../common/settings/timings.settings";
import { VoiceSettings } from "../common/settings/voice.settings";
import { EInteractionType } from "../common/types/interactionType";
import { BaseSetting } from "../common/settings/base.setting";
import Database from "../db/database";
import logger from "../../lib/logger";
import { Widget } from "../common/widget";
import { setTimeout } from "timers/promises";
import { SettingsPostInteractAction } from "../common/types/settingsPostInteractActions";
import { DBGuild } from "../common/types/dbGuild";
import { ECollectorStopReason } from "../common/types/collectorStopReason";
import { error } from "console";

const settingsEmbed = new EmbedBuilder()
    .setAuthor({ iconURL: 'https://cdn3.emoji.gg/emojis/2637-settings.png', name: 'Settings' })
    .setThumbnail(WARTIMER_ICON_LINK)
    .setDescription(`Select a button below to edit a specific setting`)
    .setFooter({
        text: `If something doesn't work try clearing the bot data in 'Misc Settings'`,
        iconURL: EXCLAMATION_ICON_LINK
    });
export class SettingsHandler {
    public static async openSettings(
        interaction: ButtonInteraction<CacheType> | CommandInteraction<CacheType>
    ): Promise<unknown> {
        const guild = interaction.guild;
        if (!guild) {
            return Promise.reject();
        }
        const settings: BaseSetting[][] = [[
            new PermissionSettings(),
            new VoiceSettings(),
            new RaidhelperSettings(),
            new TimingsSettings()
        ], [
            new NotificationSettings(),
            new MiscSettings()
        ]]
        const res = await interaction.reply({
            ephemeral: true,
            embeds: [settingsEmbed],
            components: settings.map((row) => new ActionRowBuilder()
                .setComponents(
                    row.map((setting) => new ButtonBuilder({
                        label: setting.title,
                        style: setting.buttonStyle,
                        type: ComponentType.Button,
                        customId: [WARTIMER_INTERACTION_ID, EInteractionType.SETTING, setting.id].join(WARTIMER_INTERACTION_SPLIT)
                    }))
                ) as ActionRowBuilder<any>)
        });
        let settingInteraction: AnySelectMenuInteraction | ButtonInteraction | undefined;
        const overviewCollector = (await res.fetch()).createMessageComponentCollector({ idle: 1000 * 60 * 2 });
        let settingCollector: InteractionCollector<AnySelectMenuInteraction | ButtonInteraction> | undefined;
        overviewCollector
            .on('collect', async (interaction) => {
                // Runs when a button sub setting is selected
                try {
                    const [, , interactionId] = interaction.customId.split(WARTIMER_INTERACTION_SPLIT);
                    const setting: BaseSetting | undefined = this.getSettingById(interactionId, settings);

                    if (!interaction.guild) {
                        await interaction.reply({ ephemeral: true, content: 'Unable to process request' });
                        return;
                    }
                    if (!setting) {
                        await interaction.reply({ ephemeral: true, content: 'Unable to process request' });
                        return;
                    }

                    const dbGuild = await Database.getGuild(interaction.guild);
                    if (settingInteraction) {
                        settingCollector?.stop(ECollectorStopReason.DISPOSE);
                        // Delete reply, catch into nothing because it doesn't matter
                        await settingInteraction?.deleteReply().catch(() => { });
                        settingInteraction = undefined;
                        await setTimeout(800); // artificial timeout to make switching options look less janky
                    }
                    const message = await setting.send(
                        interaction,
                        dbGuild
                    )

                    settingCollector = message.createMessageComponentCollector({ idle: 1000 * 60 * 1.5 })
                        .on('collect', async (interaction) => {
                            overviewCollector.resetTimer({ idle: 1000 * 60 * 2 })
                            try {
                                if (!interaction.guild) {
                                    await interaction.reply({ ephemeral: true, content: 'Unable to process request' });
                                    return;
                                }
                                const [, , interactionId, interactionOption] = interaction.customId.split(WARTIMER_INTERACTION_SPLIT);

                                const dbGuild = await Database.getGuild(interaction.guild);
                                const widget = await Widget.find({
                                    channelId: dbGuild.widget.channelId,
                                    messageId: dbGuild.widget.messageId,
                                    guild: interaction.guild
                                });
                                const setting: BaseSetting | undefined = this.getSettingById(interactionId, settings);
                                const postInteractActions = await setting?.onInteract(dbGuild, interaction, widget, interactionOption);

                                await this.handlePostInteractActions(
                                    postInteractActions,
                                    dbGuild,
                                    guild,
                                    widget,
                                    settingInteraction,
                                    setting
                                )
                                await interaction.deferUpdate().catch(() => { });
                            } catch (e) {
                                interaction.reply({
                                    ephemeral: true,
                                    content: e?.toString?.() ?? 'Unknown Error'
                                })
                                    .then(() => setTimeout(1000 * 20))
                                    .then(() => interaction.deleteReply())
                                    .catch((err) => logger.error(`${err?.toString?.()} | Tried logging original error: ${e?.toString?.() || 'Unknown'}`));
                            }
                        })
                        .on('end', async (interaction, reason: ECollectorStopReason) => {
                            if (reason === ECollectorStopReason.DISPOSE) return;
                            // Delete reply, catch into nothing because it doesn't matter
                            await settingInteraction?.deleteReply().catch(() => { });
                            settingInteraction = undefined;
                        });
                    if (settingInteraction) await interaction.deferUpdate();
                    settingInteraction = settingInteraction ?? interaction;
                } catch (e) {
                    await interaction.reply({
                        ephemeral: true,
                        content: e?.toString?.() ?? 'Unkown Error'
                    })
                        .then(() => setTimeout(1000 * 20))
                        .then(() => interaction.deleteReply())
                        .catch((err) => logger.error(`${err?.toString?.()} | Tried logging original error: ${e?.toString?.() || 'Unknown'}`));
                }
            })
            .on('end', async () => {
                await interaction.deleteReply().catch(() => { });
                settingInteraction = undefined;
            });
    }
    private static getSettingById(id: string, settings: BaseSetting[][]): BaseSetting | undefined {
        for (const row of settings) {
            for (const s of row) {
                if (s.id === id) {
                    return s;
                }
            }
        }
    }
    private static async handlePostInteractActions(
        postInteractActions: SettingsPostInteractAction[] | undefined,
        dbGuild: DBGuild,
        guild: Guild,
        widget?: Widget,
        settingInteraction?: AnySelectMenuInteraction | ButtonInteraction,
        setting?: BaseSetting
    ): Promise<void> {
        if (postInteractActions?.includes('saveGuild')) {
            await dbGuild.save();
        }
        if (postInteractActions?.includes('updateWidget')) {
            if (!widget?.textState) {
                await widget?.update({ force: true });
            }
        }
        if (postInteractActions?.includes('deleteGuild')) {
            await Database.deleteGuild(dbGuild.id);
            logger.debug('Guild exists: ' + await Database.hasGuild(dbGuild.id))
            if (widget) {
                await widget.delete();
            }
        }
        if (postInteractActions?.includes('update')) {
            if (settingInteraction) {
                await setting?.send(settingInteraction, dbGuild, { update: true });
            }
        }
    }
}
