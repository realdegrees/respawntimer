import { StringSelectMenuOptionBuilder } from '@discordjs/builders';
import { ChannelType, Guild, GuildChannel, StringSelectMenuBuilder, User } from 'discord.js';
const maxChannels = 23;
export enum EAdvancedChannelSelectReturnValue {
    PREV_PAGE = 'Previous Page',
    NEXT_PAGE = 'Next Page',
}
/**
 * This acts as a StringSelectMenuBuilder but sets its own options by converting all
 */
const EMOJIS = Object.freeze({
    VOICE: { name: 'voicebadge', id: '1155162483162632252' },
    TEXT: { name: 'forumbadge', id: '1153001819069493330' },
    NEXT: { name: 'nextbadge', id: '1155190707045290063' },
    PREV: { name: 'prevbadge', id: '1155190708362293268' },
});
export class AdvancedChannelSelectMenu {
    public constructor(private selectMenu: StringSelectMenuBuilder, private channels: GuildChannel[]) { }
    public getMenu(): StringSelectMenuBuilder {
        return this.selectMenu;
    }
    public getChannelCache(): GuildChannel[] {
        return this.channels;
    }
}
export class AdvancedChannelSelectMenuBuilder {
    private page: number = 1;
    private customId: string | undefined;
    private channelType: ChannelType = ChannelType.GuildText;
    private channels?: GuildChannel[];
    private placeholder: string = 'Channel';

    public constructor(private guild: Guild, private user: User) {
    }
    public setChannelType(type: ChannelType): this {
        this.channelType = type;
        return this;
    }
    public setCustomId(customId: string): this {
        this.customId = customId;
        return this;
    }
    public setChannelCache(channels: GuildChannel[] | undefined): this {
        this.channels = channels;
        return this;
    }
    /**
     * Sets the current page for the menu
     * @param number Starts at 1
     * @returns {StringSelectMenuBuilder}
     */
    public setPage(number: number): this {
        this.page = number;
        return this;
    }
    public setPlaceholder(placeholder: string): this {
        this.placeholder = placeholder;
        return this;
    }

    public async build(): Promise<AdvancedChannelSelectMenu> {
        if (!this.customId) {
            throw new Error('No Custom ID set on AdvancedChannelSelectMenuBuilder!');
        }
        const allChannels = this.guild.channels.cache.sort();
        // Filter only channels that are of this.channelType ChannelType and the given user AND bot have view permission
        this.channels = this.channels ?? (await Promise.all(allChannels.filter((channel) => {
            const valid = channel?.type === this.channelType &&
                channel.permissionsFor(this.user)?.has('ViewChannel') &&
                channel.permissionsFor(this.guild.client.user)?.has('ViewChannel');
            return valid;
        }).map((channel) => channel?.fetch().catch(() => undefined)))
            .then((channels) => channels.filter((channel) => !!channel))
            .catch(() => [] as GuildChannel[])) as GuildChannel[];

        const menuBuilder = new StringSelectMenuBuilder();
        const maxPages = this.calculatePagesForChannelAmount(this.channels.length);
        const startIndex = this.calculatePageStartIndex(this.page, maxPages);
        const amountOnPage = this.calculateItemAmountForPage(this.page, maxPages);

        // -> Add pages to options array
        const options = this.channels
            .slice(startIndex, Math.min(startIndex + amountOnPage, this.channels.length))
            .map(this.getOption.bind(this));
        // if maxPages >= 2 && page !== 1
        // -> Add previous button at top (index 0)
        if (maxPages >= 2 && this.page !== 1) {
            options.splice(0, 0, this.getPrevPageOption());
        }
        // if maxPages >= 2 && page !== maxPages
        // -> Add next button at bototm (last index)
        if (maxPages >= 2 && this.page !== maxPages) {
            options.push(this.getNextPageOption())
        }

        const seperator = maxPages > 1 && this.placeholder ? ' » ' : '';
        const pageText = (maxPages > 1 ? 'Page ' + this.page : '') || 'Select ';
        const placeholderText = `📖 ${pageText}${seperator}${this.placeholder}`

        return new AdvancedChannelSelectMenu(
            menuBuilder
                .setOptions(options)
                .setCustomId(this.customId)
                .setMaxValues(1)
                .setMinValues(1)
                .setPlaceholder(placeholderText),
            this.channels);
    }
    private calculatePagesForChannelAmount(amount: number): number {
        if (amount <= 25) { // 25 items fit on one page, no next page option needed
            return 1;
        } else if (amount <= 24 * 2) { // 48 items fit on 2 pages, only one next/prev page option needed per page
            return 2;
        } else {
            const itemAmountForMiddlePages = amount - 2 * 24;
            const pagesNeededForMiddleItems = (itemAmountForMiddlePages) / 23
            return Math.ceil(pagesNeededForMiddleItems) + 2;
        }
    }
    private getNextPageOption(): StringSelectMenuOptionBuilder {
        return new StringSelectMenuOptionBuilder()
            .setValue(EAdvancedChannelSelectReturnValue.NEXT_PAGE)
            .setLabel(EAdvancedChannelSelectReturnValue.NEXT_PAGE)
            .setEmoji(EMOJIS.NEXT);
    }
    private getPrevPageOption(): StringSelectMenuOptionBuilder {
        return new StringSelectMenuOptionBuilder()
            .setValue(EAdvancedChannelSelectReturnValue.PREV_PAGE)
            .setLabel(EAdvancedChannelSelectReturnValue.PREV_PAGE)
            .setEmoji(EMOJIS.PREV);
    }
    private getOption(channel: GuildChannel): StringSelectMenuOptionBuilder {
        return new StringSelectMenuOptionBuilder()
            .setValue(channel.id)
            .setLabel(channel.name)
            .setEmoji(channel.type === ChannelType.GuildVoice ? EMOJIS.VOICE : EMOJIS.TEXT);
        //.setDefault(this.defaults.includes(channel.id)); // commented this so page placeholder takes precedence
    }
    private calculatePageStartIndex(currentPage: number, maxPages: number): number {
        let result = 0;
        if (maxPages >= 3 && currentPage !== 1) {
            result += (currentPage - 2) * 23
        } if (currentPage > 1) {
            result += 24;
        }
        return result;
    }
    private calculateItemAmountForPage(page: number, maxPages: number): number {
        if (page === 1 && maxPages === 1) {
            return 25;
        } else if ((page === 1 || page === maxPages) && maxPages >= 2) {
            return 24;
        } else {
            return 23;
        }
    }
}