import {
    ActionRowBuilder, AnySelectMenuInteraction, ButtonBuilder, ButtonInteraction, ButtonStyle,
    CacheType,
    ChannelSelectMenuBuilder, ChannelSelectMenuInteraction, ChannelType, Guild, Interaction, MessageComponentInteraction, ModalBuilder, ModalSubmitInteraction, RoleSelectMenuBuilder, TextInputBuilder, TextInputStyle, VoiceBasedChannel
} from 'discord.js';
import { ESettingsID, BaseSetting } from './base.setting';
import raidhelperIntegration, { EVENT_REFRESH_INTERVAL } from '../../raidhelperIntegration';
import { checkChannelPermissions } from '../../util/checkChannelPermissions';
import { DBGuild } from '../types/dbGuild';
import Database from '../../db/database';
import logger from '../../../lib/logger';
import { Widget } from '../widget';

export enum ERaidhelperSettingsOptions {
    API_KEY = 'apikey',
    DEFAULT_CHANNEL = 'defaultchannel',
    EVENT_CHANNEL = 'eventchannel',
    TOGGLE_AUTO_VOICE = 'toggleautovoice',
    TOGGLE_AUTO_WIDGET = 'toggleautowidget'
}

export class RaidhelperSettings extends BaseSetting<ButtonBuilder | ChannelSelectMenuBuilder> {
    public constructor() {
        super(ESettingsID.RAIDHELPER,
            'Raidhelper Integration (Experimental)',
            `Wartimer now integrates with Raidhelper to automatically connect to a channel when an event scheduled by *Raidhelper* starts.\n
            Set the API Key below and toggle Auto-Join to enable *Raidhelper Integration*\n`,
            'Wartimer will connect to the voice channel specified in the Raidhelper event.\nIf no event is set it will use the default voice channel set below.');
    }

    public getSettingsRows() {
        const apiKeyButton = new ButtonBuilder({
            custom_id: this.getCustomId(this.id, [ERaidhelperSettingsOptions.API_KEY]),
            label: 'Set API Key',
            style: ButtonStyle.Primary
        });
        const autoJoinToggleButton = new ButtonBuilder({
            custom_id: this.getCustomId(this.id, [ERaidhelperSettingsOptions.TOGGLE_AUTO_VOICE]),
            label: 'Toggle Auto-Join',
            style: ButtonStyle.Success
        });
        const autoWidgetToggleButton = new ButtonBuilder({
            custom_id: this.getCustomId(this.id, [ERaidhelperSettingsOptions.TOGGLE_AUTO_WIDGET]),
            label: 'Toggle Auto-Widget',
            style: ButtonStyle.Success
        });
        const defaultVoiceChannel = new ChannelSelectMenuBuilder()
            .setCustomId(this.getCustomId(this.id, [ERaidhelperSettingsOptions.DEFAULT_CHANNEL]))
            .setChannelTypes(ChannelType.GuildVoice)
            .setMinValues(0)
            .setMaxValues(1)
            .setPlaceholder('Select a default voice channel');
        const raidhelperEventChannel = new ChannelSelectMenuBuilder()
            .setCustomId(this.getCustomId(this.id, [ERaidhelperSettingsOptions.EVENT_CHANNEL]))
            .setChannelTypes(ChannelType.GuildText)
            .setMinValues(0)
            .setMaxValues(1)
            .setPlaceholder('Select an event channel');

        const apiKeyRow = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(apiKeyButton)
            .addComponents(autoJoinToggleButton)
            .addComponents(autoWidgetToggleButton);
        const defaultVoiceChannelRow = new ActionRowBuilder<ChannelSelectMenuBuilder>()
            .addComponents(defaultVoiceChannel);
        const raidhelperEventChannelRow = new ActionRowBuilder<ChannelSelectMenuBuilder>()
            .addComponents(raidhelperEventChannel);


        return Promise.resolve([raidhelperEventChannelRow, defaultVoiceChannelRow, apiKeyRow]);
    }
    public async getCurrentSettings(guildData: DBGuild, guild: Guild) {
        const apiKey = guildData.raidHelper.apiKey;
        const apiKeyValid = guildData.raidHelper.apiKeyValid;
        const events = await Database.getGuild(guild)
            .then((dbGuild) => dbGuild.raidHelper.events)
            .catch(() => []);

        const defaultChannel = guildData.raidHelper.defaultVoiceChannelId ?
            await guild.channels.fetch(guildData.raidHelper.defaultVoiceChannelId).catch(() => undefined) : undefined;
        const defaultChannelText = defaultChannel && defaultChannel.isVoiceBased() ? await checkChannelPermissions(defaultChannel, ['ViewChannel', 'Connect', 'Speak'])
            .then(() => `${defaultChannel}`)
            .catch((reason) => `${defaultChannel} ⚠️ ${reason}`) :
            `*None*`;

        const scheduledEvents = events.length > 0 ?
            (await Promise.all(events.map(async (event) => {
                const voiceChannel = event.voiceChannelId ?
                    await guild.channels.fetch(event.voiceChannelId).catch(() => undefined) as VoiceBasedChannel | undefined : undefined;
                const time = '🗓️ ' + `<t:${event.startTime}:d>` + ' 🕑 ' + `<t:${event.startTime}:t>`;
                const voiceChannelPermissions = voiceChannel && voiceChannel.isVoiceBased() ? await checkChannelPermissions(voiceChannel, ['ViewChannel', 'Connect', 'Speak'])
                    .then(() => '')
                    .catch(() => `⚠️`) : '';
                return `- 📝  ${event.title}  ${time}${voiceChannel ? `  🔗 ${voiceChannel} ${voiceChannelPermissions}` : ''}`;
            }))).join('\n') : '*None*';

        const apiKeyValidText = apiKey ?
            apiKeyValid ?
                ' » *Valid Key* ✅' :
                ' » *Invalid Key* ⚠️' :
            '';
        const apiKeyText = apiKey ?
                '||```fix\n' + apiKey + '```||' :
            `Use \`/apikey show\` to retrieve your Raidhelper API Key  
                Or \`/apikey refresh\` if you don't have an API Key\n\`\`\`diff\n- Not Set\`\`\``;

        const eventChannel = guildData.raidHelper.eventChannelId ?
            await guild.channels.fetch(guildData.raidHelper.eventChannelId).catch(() => undefined) : undefined;
        const eventChannelText = eventChannel && eventChannel.isTextBased() ? await checkChannelPermissions(eventChannel, ['ViewChannel'])
            .then(() => `${eventChannel}`)
            .catch((reason) => `${eventChannel} ⚠️ ${reason}`) :
            `${'```diff\n- Not Set ```'}*Events from all channels will be scheduled*`;

        return `**Raidhelper API Key** ${apiKeyValidText}  
        ${apiKeyText}
        **Events Channel**  
        ${eventChannelText}\n
        **Auto-Join**  
        *The bot will automatically join voice when an event starts*
        ${guildData.raidHelper.enabled ? '```diff\n+ Enabled ```' : '```diff\n- Disabled ```'}
        **Auto-Widget**  
        *The bot will automatically start the text-widget (if it exists) when an event starts*
        ${guildData.raidHelper.widget ? '```diff\n+ Enabled ```' : '```diff\n- Disabled ```'}
        **Default Voice Channel**  
        ${defaultChannelText}\n
        **Scheduled Events**${(scheduledEvents.includes('⚠️') ? ' ≫ *Missing Some Permissions*' : '') || ` *(Updates every ${EVENT_REFRESH_INTERVAL} minutes)*`}  
        ${scheduledEvents}`;
    }
    public showModal(interaction: ButtonInteraction) {
        const modal = new ModalBuilder()
            .setCustomId(this.getCustomId(this.id, [ERaidhelperSettingsOptions.API_KEY]))
            .setTitle('Set Raidhelper API Key');
        const apiKey = new TextInputBuilder()
            .setCustomId(this.getCustomId(this.id, [ERaidhelperSettingsOptions.API_KEY]))
            .setLabel(ERaidhelperSettingsOptions.API_KEY)
            .setPlaceholder(`API Key`)
            .setStyle(TextInputStyle.Short);
        const apiKeyRow = new ActionRowBuilder<TextInputBuilder>()
            .addComponents(apiKey);
        modal.addComponents(apiKeyRow);
        return interaction.showModal(modal);
    }
    public async onInteract(
        dbGuild: DBGuild,
        interaction: ButtonInteraction | ModalSubmitInteraction | AnySelectMenuInteraction,
        widget: Widget | undefined,
        option: string
    ): Promise<unknown> {
        if (!interaction.guild) return Promise.reject('Unable to complete request! Cannot retrieve server data');
        switch (option) {
            case ERaidhelperSettingsOptions.API_KEY:
                if (interaction.isButton()) {
                    return this.showModal(interaction);
                } else if (interaction.isModalSubmit()) {
                    const apiKey = interaction.fields
                        .getTextInputValue(
                            this.getCustomId(
                                ESettingsID.RAIDHELPER,
                                [ERaidhelperSettingsOptions.API_KEY]
                            ));
                    return raidhelperIntegration.checkApiKey(interaction.guild, apiKey)
                        .then((valid) => {
                            if (valid) {
                                logger.info('[' + interaction.guild?.name + '] Added Raidhelper API Key');
                                dbGuild.raidHelper.apiKey = apiKey;
                                dbGuild.raidHelper.apiKeyValid = true;
                            } else {
                                return Promise.reject('Invalid API Key');
                            }
                        })
                        .then(() => dbGuild.save())
                        .then(() => {
                            if (!widget?.textState) {
                                widget?.update({ force: true });
                            }
                        })
                        .then(() => this.send(interaction, dbGuild, { update: true }));
                } else {
                    return Promise.reject('Interaction ID mismatch, try resetting the bot in the toptions if this error persists.');
                }
            case ERaidhelperSettingsOptions.DEFAULT_CHANNEL:
                if (!interaction.isChannelSelectMenu()) return Promise.reject('Interaction ID mismatch, try resetting the bot in the toptions if this error persists.');
                return interaction.guild.channels.fetch(interaction.values[0])
                    .then(async (channel) => {
                        if (!channel?.isVoiceBased()) {
                            return Promise.reject('Invalid Channel');
                        } else {
                            await checkChannelPermissions(channel, ['ViewChannel', 'Connect', 'Speak']);
                            dbGuild.raidHelper.defaultVoiceChannelId = interaction.values[0];
                            await dbGuild.save();
                            return await this.send(interaction, dbGuild, { update: true });
                        }
                    });
            case ERaidhelperSettingsOptions.EVENT_CHANNEL:
                if (!interaction.isChannelSelectMenu()) return Promise.reject('Interaction ID mismatch, try resetting the bot in the toptions if this error persists.');
                return interaction.guild.channels.fetch(interaction.values[0])
                    .then(async (channel) => {
                        if (!channel?.isTextBased()) {
                            return Promise.reject('Invalid Channel');
                        } else {
                            await checkChannelPermissions(channel, ['ViewChannel']);
                            dbGuild.raidHelper.eventChannelId = interaction.values[0];
                            await dbGuild.save();
                            return await this.send(interaction, dbGuild, { update: true });
                        }
                    });
            case ERaidhelperSettingsOptions.TOGGLE_AUTO_VOICE:
                dbGuild.raidHelper.enabled = !dbGuild.raidHelper.enabled;
                return dbGuild.save().then(() => this.send(interaction, dbGuild, { update: true }));
            case ERaidhelperSettingsOptions.TOGGLE_AUTO_WIDGET:
                dbGuild.raidHelper.widget = !dbGuild.raidHelper.widget;
                return dbGuild.save().then(() => this.send(interaction, dbGuild, { update: true }));
            default: return Promise.reject('Missing Options ID on Interaction. This should never happen');
        }
    }
}