import { ActionRowBuilder, RepliableInteraction, InteractionResponse, EmbedBuilder, Guild, ButtonBuilder, ComponentType, ButtonStyle } from 'discord.js';
import { GuildData } from '../../db/guild.schema';
import { WARTIMER_INTERACTION_ID, WARTIMER_INTERACTION_SPLIT } from '../constant';
import { EInteractionType } from '../types/interactionType';

export enum ESettingsID {
    ASSISTANT = 'assistant',
    EDITOR = 'editor',
    VOICE = 'voice',
    RAIDHELPER = 'raidhelper'
}

export abstract class Setting {
    private settings: ActionRowBuilder[] = [];
    public title: string = '';
    public description: string = '';
    public footer: string = '';
    public id: string = '';

    protected init(
        id: string,
        title: string,
        description: string,
        footer: string,
        ...settings: ActionRowBuilder[]): void {
        this.id = id;
        this.title = title;
        this.description = description;
        this.footer = footer;
        this.settings = settings;
    }
    public async send(interaction: RepliableInteraction, guild: GuildData, includeDescription = true): Promise<InteractionResponse<boolean>> {
        const settingsEmbed = new EmbedBuilder()
            .setAuthor({ iconURL: 'https://cdn3.emoji.gg/emojis/2637-settings.png', name: this.title })
            .setThumbnail('https://cdn.discordapp.com/avatars/993116789284286484/c5d1f8c2507c7f2a56a2a330109e66d2?size=1024')
            .setDescription(this.description);
        if (this.footer) {
            settingsEmbed.setFooter({
                text: this.footer,
                iconURL: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/39/Orange_exclamation_mark.svg/240px-Orange_exclamation_mark.svg.png'
            });
        }
        const desc = await this.getCurrentSettings(guild, interaction.guild ?? undefined);
        const currentSettingsEmbed = new EmbedBuilder()
            .setAuthor({ iconURL: 'https://cdn3.emoji.gg/emojis/2637-settings.png', name: 'Current Settings' })
            .setDescription(desc ? desc : '-');

        return interaction.reply({
            ephemeral: true,
            embeds: includeDescription ? [
                settingsEmbed,
                currentSettingsEmbed
            ] : [currentSettingsEmbed],
            components: this.settings as ActionRowBuilder<any>[]
        });
    }
    public getCustomId(id: string, args: string[]): string {
        return [WARTIMER_INTERACTION_ID, EInteractionType.SETTING, id, ...args].join(WARTIMER_INTERACTION_SPLIT);
    }
    public abstract getCurrentSettings(guildData: GuildData, guild?: Guild,): Promise<string>;
}