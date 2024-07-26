import { ActionRowBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType, Guild } from 'discord.js';
import { GuildData } from '../../db/guild.schema';
import { ESettingsID, Setting } from './settings';
import { checkChannelPermissions } from '../../util/checkChannelPermissions';
import { Document } from 'mongoose';

export enum ENotificationSettingsOptions {
    UPDATE_CHANNEL = 'updatechannel'
}

export class NotificationSettings extends Setting {
    public constructor() {
        super(ESettingsID.NOTIFICATIONS, ButtonStyle.Secondary);
        const channel = new ChannelSelectMenuBuilder()
            .setCustomId(this.getCustomId(this.id, [ENotificationSettingsOptions.UPDATE_CHANNEL]))
            .setChannelTypes(ChannelType.GuildText)
            .setMinValues(0)
            .setMaxValues(1)
            .setPlaceholder('Select channel');

        const channelRow = new ActionRowBuilder<ChannelSelectMenuBuilder>()
            .addComponents(channel);

        this.init(
            'Notification Settings',
            `**Notification Channel**  
            This channel will receive notifications about updates etc.`,
            '',
            channelRow
        );
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public async getCurrentSettings(guildData: Document<unknown, object, GuildData> & GuildData & Required<{
        _id: string;
    }>, guild?: Guild | undefined): Promise<string> {
        const channel = guildData.notificationChannelId ?
            await guild?.channels.fetch(guildData.notificationChannelId).catch() : undefined;
        return channel && channel.isTextBased() ? checkChannelPermissions(channel, ['ViewChannel', 'SendMessages'])
            .then(() => `**Notification Channel**\n${channel}`)
            .catch((reason) => `**Notification Channel**\n${channel}\n\n⚠️ ${reason}`) :
            `**Notification Channel**\n*None*`;
    }
}