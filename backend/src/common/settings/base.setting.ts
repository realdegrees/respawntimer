import {
    ActionRowBuilder, RepliableInteraction, InteractionResponse, EmbedBuilder,
    Guild, Message, MessageComponentInteraction, ButtonStyle, Interaction, StringSelectMenuBuilder, ButtonBuilder, ChannelSelectMenuBuilder, RoleSelectMenuBuilder, ModalSubmitInteraction, ButtonInteraction, RoleSelectMenuInteraction, ChannelSelectMenuInteraction, StringSelectMenuInteraction, ComponentBuilder, InteractionReplyOptions, AnySelectMenuInteraction, MessageResolvable
} from 'discord.js';
import { GuildData } from '../../db/guild.schema';
import { EXCLAMATION_ICON_LINK, WARTIMER_INTERACTION_ID, WARTIMER_INTERACTION_SPLIT } from '../constant';
import { EInteractionType } from '../types/interactionType';
import { Document } from 'mongoose';
import { DBGuild } from '../types/dbGuild';
import { Widget } from '../widget';
import logger from '../../../lib/logger';
import { SettingsPostInteractAction } from '../types/settingsPostInteractActions';

export enum ESettingsID {
    PERMISSIONS = 'permissions',
    VOICE = 'voice',
    RAIDHELPER = 'raidhelper',
    MISC = 'misc',
    NOTIFICATIONS = 'notifications',
    TIMINGS = 'timings'
}

export abstract class BaseSetting<
    MenuOptions extends ButtonBuilder | StringSelectMenuBuilder | ChannelSelectMenuBuilder | RoleSelectMenuBuilder =
    ButtonBuilder | RoleSelectMenuBuilder | StringSelectMenuBuilder | ChannelSelectMenuBuilder> {

    protected constructor(
        public id: string,
        public title: string,
        public description: string,
        public footer: string,
        public buttonStyle: ButtonStyle = ButtonStyle.Primary) { }

    public async send(
        interaction: AnySelectMenuInteraction | ButtonInteraction,
        dbGuild: DBGuild,
        options?: {
            removeDescription?: boolean;
            removeCurrentSettings?: boolean;
            customEmbed?: EmbedBuilder;
            update?: boolean;
        }
    ): Promise<Message<boolean>> {
        const settingsEmbed = new EmbedBuilder()
            .setAuthor({ iconURL: 'https://cdn3.emoji.gg/emojis/2637-settings.png', name: this.title })
            .setThumbnail('https://cdn.discordapp.com/avatars/993116789284286484/c5d1f8c2507c7f2a56a2a330109e66d2?size=1024')
            .setDescription(this.description);
        if (this.footer) {
            settingsEmbed.setFooter({
                text: this.footer,
                iconURL: EXCLAMATION_ICON_LINK
            });
        }
        const currentSettingsDesc = await this.getCurrentSettings(dbGuild, interaction.guild ?? undefined);
        const currentSettingsEmbed = new EmbedBuilder()
            .setAuthor({ iconURL: 'https://cdn3.emoji.gg/emojis/2637-settings.png', name: 'Current Settings' })
            .setDescription(currentSettingsDesc ? currentSettingsDesc : '-');

        // Collect embeds
        const embeds: EmbedBuilder[] = [];
        if (!options?.removeDescription) embeds.push(settingsEmbed);
        if (!options?.removeCurrentSettings && currentSettingsDesc) embeds.push(currentSettingsEmbed);
        if (options?.customEmbed) embeds.push(options.customEmbed);

        const rows = await this.getSettingsRows(dbGuild, interaction);
        const content = {
            ephemeral: true,
            embeds: embeds,
            components: rows
        };
        if (!options?.update) {
            await interaction.deferReply({ ephemeral: true });
        }
        return await interaction.editReply(content);
    }
    public getCustomId(id: string, args: string[]): string {
        return [WARTIMER_INTERACTION_ID, EInteractionType.SETTING, id, ...args].join(WARTIMER_INTERACTION_SPLIT);
    }
    public abstract getSettingsRows(dbGuild: DBGuild, interaction: AnySelectMenuInteraction | ButtonInteraction): Promise<ActionRowBuilder<MenuOptions>[]>;
    public abstract getCurrentSettings(dbGuild: DBGuild, guild?: Guild): Promise<string>;
    public abstract onInteract(dbGuild: DBGuild, interaction: ButtonInteraction | ModalSubmitInteraction | AnySelectMenuInteraction, widget: Widget | undefined, option: string): Promise<SettingsPostInteractAction[]>;
}