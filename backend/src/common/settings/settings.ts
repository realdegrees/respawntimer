import { ActionRowBuilder, RepliableInteraction, InteractionResponse, EmbedBuilder, Guild, Message, MessageComponentInteraction, ButtonStyle } from 'discord.js';
import { GuildData } from '../../db/guild.schema';
import { WARTIMER_INTERACTION_ID, WARTIMER_INTERACTION_SPLIT } from '../constant';
import { EInteractionType } from '../types/interactionType';
import logger from '../../../lib/logger';

export enum ESettingsID {
    PERMISSIONS = 'permissions',
    VOICE = 'voice',
    RAIDHELPER = 'raidhelper',
    MISC = 'misc'
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
        guild: GuildData,
        options?: {
            removeDescription?: boolean;
            removeCurrentSettings?: boolean;
            customEmbed?: EmbedBuilder;
            deleteOriginal?: boolean;
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
                iconURL: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/39/Orange_exclamation_mark.svg/240px-Orange_exclamation_mark.svg.png'
            });
        }
        const currentSettingsDesc = await this.getCurrentSettings(guild, interaction.guild ?? undefined);
        const currentSettingsEmbed = new EmbedBuilder()
            .setAuthor({ iconURL: 'https://cdn3.emoji.gg/emojis/2637-settings.png', name: 'Current Settings' })
            .setDescription(currentSettingsDesc ? currentSettingsDesc : '-');

        // Collect embeds
        const embeds: EmbedBuilder[] = [];
        if (!options?.removeDescription) embeds.push(settingsEmbed);
        if (!options?.removeCurrentSettings && currentSettingsDesc) embeds.push(currentSettingsEmbed);
        if (options?.customEmbed) embeds.push(options.customEmbed);

        // Delete 
        if (options?.deleteOriginal && !options.update) {
            logger.debug('deleting original');
            return (interaction as MessageComponentInteraction).deferUpdate().then(() => interaction.deleteReply()).then(undefined);
        }

        const content = {
            ephemeral: true,
            embeds: embeds,
            components: this.settings as ActionRowBuilder<any>[]
        };
        
        return options?.update ?
            await (interaction as MessageComponentInteraction).deferUpdate().then(() => interaction.editReply(content)) :
            interaction.reply(content);
    }
    public getCustomId(id: string, args: string[]): string {
        return [WARTIMER_INTERACTION_ID, EInteractionType.SETTING, id, ...args].join(WARTIMER_INTERACTION_SPLIT);
    }
    public abstract getCurrentSettings(guildData: GuildData, guild?: Guild,): Promise<string>;
}