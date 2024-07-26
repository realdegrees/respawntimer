import {
    ActionRowBuilder, AnySelectMenuInteraction, ButtonBuilder, ButtonInteraction, ButtonStyle,
    CacheType,
    ChannelSelectMenuBuilder, ChannelType, Colors, EmbedField, Guild, ModalBuilder, ModalSubmitInteraction, TextInputBuilder, TextInputStyle
} from 'discord.js';
import { ESettingsID, BaseSetting } from './base.setting';
import { checkChannelPermissions } from '../../util/permissions';
import { DBGuild } from '../types/dbGuild';
import Database from '../../db/database';
import logger from '../../../lib/logger';
import { Widget } from '../../widget';
import { SettingsPostInteractAction } from '../types/settingsPostInteractActions';
import { setTimeout } from 'timers/promises';
import { RaidhelperIntegration } from '../../raidhelperIntegration';
import { EPHEMERAL_REPLY_DURATION_SHORT, RAIDHELPER_INTEGRATION_NUM_EVENTS_PER_QUERY } from '../constant';
import { formatEvents } from '../../util/formatEvents';
import { ScheduledEvent } from '../types/raidhelperEvent';
import { getEventPollingInterval } from '../../util/getEventPollingInterval';
import { NotificationHandler } from '../../handlers/notificationHandler';

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
            ButtonStyle.Primary,
            'Raidhelper Integration (Experimental)',
            `Wartimer now integrates with Raidhelper to automatically connect to a channel when an event scheduled by *Raidhelper* starts.\n
            Set the API Key below and toggle Auto-Join to enable *Raidhelper Integration*\n`,
            'Wartimer will connect to the voice channel specified in the Raidhelper event.\nIf no event is set it will use the default voice channel set below.'
        );
    }

    public getSettingsRows(dbGuild: DBGuild, interaction: ButtonInteraction | ModalSubmitInteraction | AnySelectMenuInteraction) {
        const apiKeyButton = new ButtonBuilder({
            custom_id: this.getCustomId(this.id, [ERaidhelperSettingsOptions.API_KEY]),
            label: 'Set API Key',
            style: dbGuild.raidHelper.apiKeyValid ? ButtonStyle.Secondary : ButtonStyle.Primary,
            disabled: !!dbGuild.raidHelper.apiKeyValid
        });
        const autoJoinToggleButton = new ButtonBuilder({
            custom_id: this.getCustomId(this.id, [ERaidhelperSettingsOptions.TOGGLE_AUTO_VOICE]),
            label: `${dbGuild.raidHelper.enabled ? 'Disable' : 'Enable'} Auto-Join`,
            style: dbGuild.raidHelper.enabled ? ButtonStyle.Danger : ButtonStyle.Success
        });
        const autoWidgetToggleButton = new ButtonBuilder({
            custom_id: this.getCustomId(this.id, [ERaidhelperSettingsOptions.TOGGLE_AUTO_WIDGET]),
            label: `${dbGuild.raidHelper.widget ? 'Disable' : 'Enable'} Auto-Widget`,
            style: dbGuild.raidHelper.widget ? ButtonStyle.Danger : ButtonStyle.Success
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

        const autoRow = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(autoJoinToggleButton)
            .addComponents(autoWidgetToggleButton);
        const apiKeyRow = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(apiKeyButton);
        const defaultVoiceChannelRow = new ActionRowBuilder<ChannelSelectMenuBuilder>()
            .addComponents(defaultVoiceChannel);
        const raidhelperEventChannelRow = new ActionRowBuilder<ChannelSelectMenuBuilder>()
            .addComponents(raidhelperEventChannel);

        return Promise.resolve([
            raidhelperEventChannelRow,
            defaultVoiceChannelRow,
            autoRow,
            apiKeyRow
        ]);
    }
    public async getCurrentSettings(guildData: DBGuild, guild: Guild) {
        // Default Voice Channel
        const defaultVoiceChannel = guildData.raidHelper.defaultVoiceChannelId ?
            await guild.channels.fetch(guildData.raidHelper.defaultVoiceChannelId).catch(() => undefined) : undefined;
        const defaultVoiceChannelText = defaultVoiceChannel && defaultVoiceChannel.isVoiceBased() ?
            await checkChannelPermissions(defaultVoiceChannel, ['ViewChannel', 'Connect', 'Speak'])
                .then(() => `${defaultVoiceChannel}`)
                .catch((reason) => `${defaultVoiceChannel} ⚠️ ${reason}`) :
            `*None*`;

        // Scheduled Events
        const events = await Database.getGuild(guild)
            .then((dbGuild) => dbGuild.raidHelper.events)
            .catch(() => []);
        const scheduledEvents = events.length > 0 ? await formatEvents(guild, ...events) : ['*None*'];
        const eventChannelPermissionInfo = scheduledEvents.includes('⚠️') ? ' ≫ *Missing Some Permissions*' : '';

        // API KEY
        const apiKey = guildData.raidHelper.apiKey;
        const apiKeyValid = guildData.raidHelper.apiKeyValid;
        const apiKeyValidText = apiKey ?
            apiKeyValid ?
                ' » *Valid Key* ✅' :
                ' » *Last Request Failed* ⚠️' :
            '';
        const apiKeyText = apiKey ?
            '||```fix\n' + apiKey + '```||' :
            '```diff\n- Not Set```';
        const apiKeyNotSetInfo = !apiKey ? 'Use `/apikey show` to retrieve your Raidhelper API Key\nOr `/apikey refresh` if you don\'t have an API Key yet' : '';
        const apiKeyInvalidInfo = apiKey && !apiKeyValid ? 'You can use `/apikey refresh` to get a new API Key and enter it again' : '';

        const eventChannel = guildData.raidHelper.eventChannelId ?
            await guild.channels.fetch(guildData.raidHelper.eventChannelId).catch(() => undefined) : undefined;
        // No need to check permissions for the text channel as we only use the id as a filter for the Raidhelper API
        const eventChannelText = eventChannel && eventChannel.isTextBased() ?
            `Only events posted in ${eventChannel} will be scheduled\n` :
            `\`\`\`diff\n- Not Set\`\`\`*Events from all channels will be scheduled*`;
        const refreshDurationInfo = `Refresh every **${(getEventPollingInterval(scheduledEvents.length) / 1000 / 60).toFixed(0)}** minutes`;
        const maxEventsInfo = `Max **${RAIDHELPER_INTEGRATION_NUM_EVENTS_PER_QUERY}** Events`;

        return [{
            name: `Raidhelper API Key${apiKeyValidText} `,
            value: `${apiKeyNotSetInfo}${apiKeyInvalidInfo}${apiKeyText}`
        }, {
            name: `Events Channel`,
            value: eventChannelText
        }, {
            name: `Auto-Join`,
            value: '*The bot will automatically join voice when an event starts*\n' +
                (guildData.raidHelper.enabled ?
                    '```diff\n+ Enabled ```' :
                    '```diff\n- Disabled ```'),
            inline: true
        }, {
            name: `Auto-Widget`,
            value: '*The bot will automatically start the text-widget when an event starts*\n' +
                (guildData.raidHelper.widget ?
                    '```diff\n+ Enabled ```' :
                    '```diff\n- Disabled ```'),
            inline: true
        }, {
            name: `Default Voice Channel`,
            value: defaultVoiceChannelText
        }, {
            name: `Scheduled Events${eventChannelPermissionInfo || ` ≫ *${maxEventsInfo}* ≫ *${refreshDurationInfo}*`}`,
            value: `${scheduledEvents.map((event) => `- ${event}`).join('\n')}`
        }] as EmbedField[];
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
    ): Promise<SettingsPostInteractAction[]> {
        if (!interaction.guild) return Promise.reject('Unable to complete request! Cannot retrieve server data');
        const guild = interaction.guild;
        let events: ScheduledEvent[];
        switch (option) {
            case ERaidhelperSettingsOptions.API_KEY:
                if (!interaction.isButton()) return Promise.reject('Interaction ID mismatch, try resetting the bot in the toptions if this error persists.');
                await this.showModal(interaction);
                let modalInteraction;
                try {
                    modalInteraction = await interaction.awaitModalSubmit({ time: 1000 * 60 * 60 })
                } catch (e) {
                    return [];
                }
                const apiKey = modalInteraction.fields
                    .getTextInputValue(this.getCustomId(
                        ESettingsID.RAIDHELPER,
                        [ERaidhelperSettingsOptions.API_KEY]
                    ));
                dbGuild.raidHelper.apiKey = apiKey;
                try {
                    events = await RaidhelperIntegration.getEvents(dbGuild);
                } catch (e) {
                    await modalInteraction.reply({ ephemeral: true, content: 'Invalid API Key.\nTry using `/apikey refresh` to get a new key.' })
                        .then(() => setTimeout(EPHEMERAL_REPLY_DURATION_SHORT))
                        .then(() => interaction.deleteReply())
                        .catch(logger.error);
                    return [];
                }
                // onFetchEventSuccess saves the events to db, sets apiKeyValid and handles notifications
                await RaidhelperIntegration.onFetchEventSuccess(guild, dbGuild, events)
                await modalInteraction.deferUpdate();
                return ['update', 'startEventPolling'] as SettingsPostInteractAction[];
                break;
            case ERaidhelperSettingsOptions.DEFAULT_CHANNEL:
                if (!interaction.isChannelSelectMenu()) return Promise.reject('Interaction ID mismatch, try resetting the bot in the toptions if this error persists.');
                const defaultVoiceChannel = await interaction.guild.channels.fetch(interaction.values[0])
                if (!defaultVoiceChannel?.isVoiceBased()) {
                    return Promise.reject('Invalid Channel');
                } else {
                    await checkChannelPermissions(defaultVoiceChannel, ['ViewChannel', 'Connect', 'Speak']);
                    dbGuild.raidHelper.defaultVoiceChannelId = interaction.values[0];
                    return ['saveGuild', 'update', 'updateWidget'];
                }
                break;
            case ERaidhelperSettingsOptions.EVENT_CHANNEL:
                if (!interaction.isChannelSelectMenu()) return Promise.reject('Interaction ID mismatch, try resetting the bot in the toptions if this error persists.');
                const defaultEventChannel = await interaction.guild.channels.fetch(interaction.values[0])
                if (!defaultEventChannel?.isTextBased()) {
                    return Promise.reject('Invalid Channel');
                } else {
                    await checkChannelPermissions(defaultEventChannel, ['ViewChannel']);
                    dbGuild.raidHelper.eventChannelId = interaction.values[0];
                    return ['saveGuild', 'update'];
                }
                break;
            case ERaidhelperSettingsOptions.TOGGLE_AUTO_VOICE:
                dbGuild.raidHelper.enabled = !dbGuild.raidHelper.enabled;
                return ['saveGuild', 'update', 'updateWidget'];
            case ERaidhelperSettingsOptions.TOGGLE_AUTO_WIDGET:
                dbGuild.raidHelper.widget = !dbGuild.raidHelper.widget;
                return ['saveGuild', 'update'];
            default: return Promise.reject('Missing Options ID on Interaction. This should never happen');
        }
    }
}