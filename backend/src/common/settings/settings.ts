import { ActionRowBuilder, RepliableInteraction, InteractionResponse, EmbedBuilder, Guild, Message, MessageComponentInteraction, ButtonStyle } from 'discord.js';
import { GuildData } from '../../db/guild.schema';
import { EXCLAMATION_ICON_LINK, WARTIMER_INTERACTION_ID, WARTIMER_INTERACTION_SPLIT } from '../constant';
import { EInteractionType } from '../types/interactionType';
import { Document } from 'mongoose';
import { DBGuild } from '../types/dbGuild';

export enum ESettingsID {
    PERMISSIONS = 'permissions',
    VOICE = 'voice',
    RAIDHELPER = 'raidhelper',
    MISC = 'misc',
    NOTIFICATIONS = 'notifications',
    TIMINGS = 'timings'
}

export abstract class Setting {
    private settings: ActionRowBuilder[] = [];
    public title: string = '';
    public description: string = '';
    public footer: string = '';

    protected constructor(public id: string, public buttonStyle: ButtonStyle = ButtonStyle.Primary) { }
    protected init(
        title: string,
        description: string,
        footer: string,
        ...settings: ActionRowBuilder[]): void {
        this.title = title;
        this.description = description;
        this.footer = footer;
        this.settings = settings;
    }
    public async send(
        interaction: RepliableInteraction | MessageComponentInteraction,
        dbGuild: Document<unknown, object, GuildData> & GuildData & Required<{
            _id: string;
        }>,
        options?: {
            removeDescription?: boolean;
            removeCurrentSettings?: boolean;
            customEmbed?: EmbedBuilder;
            update?: boolean;
        }
    ): Promise<undefined | InteractionResponse<boolean> | Message<boolean>> {
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

        const content = {
            ephemeral: true,
            embeds: embeds,
            components: this.settings as ActionRowBuilder<any>[]
        };

        return options?.update ?
            (interaction as MessageComponentInteraction).deferUpdate()
                .then(() => interaction.editReply(content)) :
            interaction.reply(content);
    }
    public getCustomId(id: string, args: string[]): string {
        return [WARTIMER_INTERACTION_ID, EInteractionType.SETTING, id, ...args].join(WARTIMER_INTERACTION_SPLIT);
    }
    public abstract getCurrentSettings(dbGuild: DBGuild, guild?: Guild,): Promise<string>;
}