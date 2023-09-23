import {
    ActionRowBuilder, EmbedBuilder,
    Guild, Message, ButtonStyle, StringSelectMenuBuilder,
    ButtonBuilder, ChannelSelectMenuBuilder, RoleSelectMenuBuilder,
    ModalSubmitInteraction, ButtonInteraction, AnySelectMenuInteraction, EmbedField
} from 'discord.js';
import { BULB_ICON_LINK, WARTIMER_INTERACTION_ID, WARTIMER_INTERACTION_SPLIT } from '../constant';
import { EInteractionType } from '../types/interactionType';
import { DBGuild } from '../types/dbGuild';
import { Widget } from '../../widget';
import { SettingsPostInteractAction } from '../types/settingsPostInteractActions';

export enum ESettingsID {
    PERMISSIONS = 'Permissions',
    VOICE = 'Voice',
    RAIDHELPER = 'Raidhelper Integration',
    WIDGET = 'Widget',
    NOTIFICATIONS = 'Notifications',
    TIMINGS = 'Respawn Timers',
    HELP = 'Help',
    DEV = 'Dev'
}

export abstract class BaseSetting<
    MenuOptions extends ButtonBuilder | StringSelectMenuBuilder | ChannelSelectMenuBuilder | RoleSelectMenuBuilder =
    ButtonBuilder | RoleSelectMenuBuilder | StringSelectMenuBuilder | ChannelSelectMenuBuilder> {
    public title: string | undefined;
    public description: string | undefined;
    public footer: string | undefined;
    public customEmbeds: EmbedBuilder[] | undefined;
    protected constructor(
        id: string,
        buttonStyle: ButtonStyle,
        title: string,
        description: string,
        footer: string
    );
    protected constructor(
        id: string,
        buttonStyle: ButtonStyle,
        customEmbeds: EmbedBuilder[]
    );
    protected constructor(
        public id: string,
        public buttonStyle: ButtonStyle,
        arg3: string | EmbedBuilder[],
        arg4?: string,
        arg5?: string
    ) {
        if (Array.isArray(arg3)) {
            this.customEmbeds = arg3;
        } else {
            this.title = arg3;
            this.description = arg4;
            this.footer = arg5;
        }
    }
    public async send(
        interaction: AnySelectMenuInteraction | ButtonInteraction,
        dbGuild: DBGuild,
        options?: {
            removeDescription?: boolean;
            removeCurrentSettings?: boolean;
            update?: boolean;
        }
    ): Promise<Message<boolean>> {
        // Init Description Embed(s)
        let embeds = this.customEmbeds ?? [new EmbedBuilder()
            .setAuthor({ iconURL: 'https://cdn3.emoji.gg/emojis/2637-settings.png', name: this.title || 'Missing Title' })
            .setThumbnail('https://cdn.discordapp.com/avatars/993116789284286484/c5d1f8c2507c7f2a56a2a330109e66d2?size=1024')
            .setDescription(this.description || 'Missing Description')]

        if (!this.customEmbeds && this.footer) {
            embeds[0].setFooter({
                text: this.footer,
                iconURL: BULB_ICON_LINK
            });
        }

        // Init Settings Embed
        const currentSettingsDesc = await this.getCurrentSettings(dbGuild, interaction.guild ?? undefined);
        const currentSettingsEmbed = new EmbedBuilder()
            .setAuthor({ iconURL: 'https://cdn3.emoji.gg/emojis/2637-settings.png', name: 'Current Settings' })

        if (typeof currentSettingsDesc === 'string') {
            currentSettingsEmbed.setDescription(currentSettingsDesc || '-');
        } else {
            currentSettingsEmbed.setFields(currentSettingsDesc)
        }

        // Set final embeds
        if (options?.removeDescription) embeds = [];
        if (!options?.removeCurrentSettings && currentSettingsDesc) embeds.push(currentSettingsEmbed);

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
    public abstract getCurrentSettings(dbGuild: DBGuild, guild?: Guild): Promise<EmbedField[] | string>;
    public abstract onInteract(dbGuild: DBGuild, interaction: ButtonInteraction | ModalSubmitInteraction | AnySelectMenuInteraction, widget: Widget | undefined, option: string): Promise<SettingsPostInteractAction[]>;
}