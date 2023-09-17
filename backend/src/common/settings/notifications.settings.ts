import { ActionRowBuilder, AnySelectMenuInteraction, BaseSelectMenuBuilder, ButtonInteraction, ButtonStyle, CacheType, ChannelSelectMenuBuilder, ChannelSelectMenuInteraction, ChannelType, EmbedBuilder, Guild, Interaction, MessageComponentInteraction, ModalSubmitInteraction, StringSelectMenuBuilder } from 'discord.js';
import { GuildData } from '../../db/guild.schema';
import { ESettingsID, BaseSetting } from './base.setting';
import { checkChannelPermissions } from '../../util/checkChannelPermissions';
import { Document } from 'mongoose';
import { DBGuild } from '../types/dbGuild';
import logger from '../../../lib/logger';
import { EXCLAMATION_ICON_LINK, WARTIMER_ICON_LINK } from '../constant';
import { Widget } from '../widget';

export enum ENotificationSettingsOptions {
    UPDATE_CHANNEL = 'updatechannel'
}

export class NotificationSettings extends BaseSetting<ChannelSelectMenuBuilder> {


    public constructor() {
        super(ESettingsID.NOTIFICATIONS,
            'Notification Settings',
            `**Notification Channel**  
            This channel will receive notifications about updates and new features.  
            If the bot encounters any errors you will also get notified about it in this channel.`,
            '',
            ButtonStyle.Secondary
        );
    }
    public getSettingsRows() {
        const channel = new ChannelSelectMenuBuilder()
            .setCustomId(this.getCustomId(this.id, [ENotificationSettingsOptions.UPDATE_CHANNEL]))
            .setChannelTypes(ChannelType.GuildText)
            .setMinValues(0)
            .setMaxValues(1)
            .setPlaceholder('Select channel');

        const channelRow = new ActionRowBuilder<ChannelSelectMenuBuilder>()
            .addComponents(channel);
        return Promise.resolve([channelRow]);
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public async getCurrentSettings(guildData: DBGuild, guild?: Guild | undefined) {
        const channel = guildData.notificationChannelId ?
            await guild?.channels.fetch(guildData.notificationChannelId).catch(() => undefined) : undefined;
        return channel && channel.isTextBased() ? checkChannelPermissions(channel, ['ViewChannel', 'SendMessages'])
            .then(() => `**Notification Channel**\n${channel}`)
            .catch((reason) => `**Notification Channel**\n${channel}\n\n⚠️ ${reason}`) :
            `**Notification Channel**\n*None*`;
    }
    public async onInteract(
        dbGuild: DBGuild,
        interaction: ButtonInteraction | ModalSubmitInteraction | AnySelectMenuInteraction,
        widget: Widget | undefined,
        option: string
    ): Promise<unknown> {
        if (!interaction.guild) return Promise.reject('Unable to complete request! Cannot retrieve server data');
        switch (option) {
            case ENotificationSettingsOptions.UPDATE_CHANNEL:
                if (!interaction.isChannelSelectMenu()) return Promise.reject('Interaction ID mismatch, try resetting the bot in the toptions if this error persists.');
                return interaction.guild.channels.fetch(interaction.values[0])
                    .then(async (channel) => {
                        if (!channel?.isTextBased()) {
                            return Promise.reject('Invalid Channel');
                        } else {
                            await checkChannelPermissions(channel, ['ViewChannel', 'SendMessages']);
                            logger.info('[' + channel.guild.name + '] Enabled Notifications');
                            dbGuild.notificationChannelId = interaction.values[0];
                            await channel.send({
                                embeds: [new EmbedBuilder()
                                    .setAuthor({
                                        iconURL: EXCLAMATION_ICON_LINK,
                                        name: 'Wartimer Notifications'
                                    })
                                    .setThumbnail(WARTIMER_ICON_LINK)
                                    .setDescription('This channel will now receive bot update notifications!')]
                            });
                            await dbGuild.save().then(() => {
                                if (!widget?.textState) {
                                    widget?.update({ force: true });
                                }
                            });
                            return await this.send(interaction, dbGuild, { update: true });
                        }
                    });
            default: return Promise.reject('Missing Options ID on Interaction. This should never happen');
        }
    }
}