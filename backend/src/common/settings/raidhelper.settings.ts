import {
    ActionRowBuilder, AnySelectMenuInteraction, ButtonBuilder, ButtonInteraction, ButtonStyle,
    ChannelType,  EmbedField,  GuildChannel, ModalBuilder, ModalSubmitInteraction, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle
} from 'discord.js';
import { ESettingsID, BaseSetting } from './base.setting';
import { checkChannelPermissions } from '../../util/permissions';
import { DBGuild } from '../types/dbGuild';
import logger from '../../../lib/logger';
import { Widget } from '../../widget';
import { SettingsPostInteractAction } from '../types/settingsPostInteractActions';
import { setTimeout } from 'timers/promises';
import { RaidhelperIntegration } from '../../raidhelperIntegration';
import { EPHEMERAL_REPLY_DURATION_SHORT } from '../constant';
import { formatEventsNoFetch } from '../../util/formatEvents';
import { ScheduledEvent } from '../types/raidhelperEvent';
import { AdvancedChannelSelectMenuBuilder, EAdvancedChannelSelectReturnValue } from '../../util/advancedChannelSelectMenuBuilder';
import Bot from '../../bot';

export enum ERaidhelperSettingsOptions {
    API_KEY = 'apikey',
    DEFAULT_CHANNEL = 'defaultchannel',
    EVENT_CHANNEL = 'eventchannel',
    TOGGLE_AUTO_VOICE = 'toggleautovoice',
    TOGGLE_AUTO_WIDGET = 'toggleautowidget'
}
export class RaidhelperSettings extends BaseSetting<ButtonBuilder | StringSelectMenuBuilder> {
    private waitingForApiKeyModal = false;

    private voiceChannelSelectPage = 1;
    private voiceChannelSelectCache: GuildChannel[] | undefined;

    private textChannelSelectPage = 1;
    private textChannelSelectCache: GuildChannel[] | undefined;

    public constructor() {
        super(ESettingsID.RAIDHELPER,
            ButtonStyle.Primary,
            'Raidhelper Integration',
            `**Respawn Timer** now integrates with Raidhelper to automatically connect to a channel when an event scheduled by *Raidhelper* starts.\n
            Set the API Key to enable **automatic event scheduling!**\n`,
            'Respawn Timer will connect to the voice channel specified in the Raidhelper event.\nIf no voice channel is set for an event it will use the default voice channel set below.'
        );
    }

    public async getSettingsRows(dbGuild: DBGuild, interaction: ButtonInteraction | ModalSubmitInteraction | AnySelectMenuInteraction) {
        const apiKeyButton = new ButtonBuilder({
            custom_id: this.getCustomId(this.id, [ERaidhelperSettingsOptions.API_KEY]),
            label: dbGuild.raidHelper.apiKeyValid ? 'Change API Key' : 'Set API Key',
            style: ButtonStyle.Primary,
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

        const textChannelSelectMenu = await new AdvancedChannelSelectMenuBuilder(interaction.guild!, interaction.user)
            .setCustomId(this.getCustomId(this.id, [ERaidhelperSettingsOptions.EVENT_CHANNEL]))
            .setChannelType(ChannelType.GuildText)
            .setChannelCache(this.textChannelSelectCache)
            .setPage(this.textChannelSelectPage)
            .setPlaceholder('Event Channel')
            .build();

        const voiceChannelSelectMenu = await new AdvancedChannelSelectMenuBuilder(interaction.guild!, interaction.user)
            .setCustomId(this.getCustomId(this.id, [ERaidhelperSettingsOptions.DEFAULT_CHANNEL]))
            .setChannelType(ChannelType.GuildVoice)
            .setChannelCache(this.voiceChannelSelectCache)
            .setPage(this.voiceChannelSelectPage)
            .setPlaceholder('Default Voice Channel')
            .build();

        this.textChannelSelectCache = textChannelSelectMenu.getChannelCache();
        this.voiceChannelSelectCache = voiceChannelSelectMenu.getChannelCache();

        const buttonRow = new ActionRowBuilder<ButtonBuilder>()
					.addComponents(autoJoinToggleButton)
					.addComponents(autoWidgetToggleButton)
					.addComponents(apiKeyButton);
        const defaultVoiceChannelRow = new ActionRowBuilder<StringSelectMenuBuilder>()
            .addComponents(voiceChannelSelectMenu.getMenu());
        const raidhelperEventChannelRow = new ActionRowBuilder<StringSelectMenuBuilder>()
            .addComponents(textChannelSelectMenu.getMenu());

        return Promise.resolve([
            raidhelperEventChannelRow,
            defaultVoiceChannelRow,
            buttonRow
        ]);
    }
    public async getCurrentSettings(dbGuild: DBGuild) {
        const defaultVoiceChannelText = dbGuild.raidHelper.defaultVoiceChannelId
					? `<#${dbGuild.raidHelper.defaultVoiceChannelId}>`
					: `*None*`;

        // Scheduled Events
        const events = dbGuild.raidHelper.events;

        const scheduledEvents = events.length > 0 ? formatEventsNoFetch(dbGuild, ...events) : ['*None*'];

        // API KEY
        const apiKey = dbGuild.raidHelper.apiKey;
        const apiKeyValid = dbGuild.raidHelper.apiKeyValid;
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

        // No need to check permissions for the text channel as we only use the id as a filter for the Raidhelper API
        const eventChannelText = dbGuild.raidHelper.eventChannelId
					? `Only events posted in <#${dbGuild.raidHelper.eventChannelId}> will be scheduled\n`
					: `\`\`\`diff\n- Not Set\`\`\`*Events from all channels will be scheduled*`;

        return [{
            name: `Raidhelper API Key${apiKeyValidText} `,
            value: `${apiKeyNotSetInfo}${apiKeyInvalidInfo}${apiKeyText}`
        }, {
            name: `Events Channel`,
            value: eventChannelText
        }, {
            name: `Auto-Join`,
            value: '*The bot will automatically join voice when an event starts*\n' +
                (dbGuild.raidHelper.enabled ?
                    '```diff\n+ Enabled ```' :
                    '```diff\n- Disabled ```'),
            inline: true
        }, {
            name: `Auto-Widget`,
            value: '*The bot will automatically start the text-widget when an event starts*\n' +
                (dbGuild.raidHelper.widget ?
                    '```diff\n+ Enabled ```' :
                    '```diff\n- Disabled ```'),
            inline: true
        }, {
            name: `Default Voice Channel`,
            value: defaultVoiceChannelText
        }, {
            name: `Scheduled Events`,
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
        let value;
        switch (option) {
            case ERaidhelperSettingsOptions.API_KEY:
                if (!interaction.isButton()) return Promise.reject('Interaction ID mismatch, try resetting the bot in the toptions if this error persists.');
                await this.showModal(interaction);
                if (this.waitingForApiKeyModal) {
                    return [];
                }
                let modalInteraction: ModalSubmitInteraction;
                try {
                    this.waitingForApiKeyModal = true;
                    modalInteraction = await interaction.awaitModalSubmit({ time: 1000 * 60 * 5 })
                } catch (e) {
                    this.waitingForApiKeyModal = false;
                    return [];
                }
                this.waitingForApiKeyModal = false;
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
                        .then(() => modalInteraction.deleteReply())
                        .catch(logger.error);
                    return [];
                }
                // onFetchEventSuccess saves the events to db, sets apiKeyValid and handles notifications
                await RaidhelperIntegration.onFetchEventSuccess(dbGuild, events)
                await modalInteraction.deferUpdate();
                return ['update', 'startEventPolling'] as SettingsPostInteractAction[];
                break;
            case ERaidhelperSettingsOptions.DEFAULT_CHANNEL:
                if (!interaction.isStringSelectMenu()) return Promise.reject('Interaction ID mismatch, try resetting the bot in the toptions if this error persists.');

                value = interaction.values[0];

                if (value === EAdvancedChannelSelectReturnValue.NEXT_PAGE) {
                    this.voiceChannelSelectPage += 1;
                    return ['update'];
                } else if (value === EAdvancedChannelSelectReturnValue.PREV_PAGE) {
                    this.voiceChannelSelectPage -= 1;
                    return ['update'];
                }

                const defaultVoiceChannel = await interaction.guild.channels.fetch(value)
                if (!defaultVoiceChannel) {
                    return Promise.reject('Unable to find selected channel!');
                }
                await checkChannelPermissions(defaultVoiceChannel, ['ViewChannel', 'Connect', 'Speak']);
                dbGuild.raidHelper.defaultVoiceChannelId = value;
                return ['saveGuild', 'update', 'updateWidget'];

                break;
            case ERaidhelperSettingsOptions.EVENT_CHANNEL:
                if (!interaction.isStringSelectMenu()) return Promise.reject('Interaction ID mismatch, try resetting the bot in the toptions if this error persists.');

                value = interaction.values[0];

                if (value === EAdvancedChannelSelectReturnValue.NEXT_PAGE) {
                    this.textChannelSelectPage += 1;
                    return ['update'];
                } else if (value === EAdvancedChannelSelectReturnValue.PREV_PAGE) {
                    this.textChannelSelectPage -= 1;
                    return ['update'];
                }

                const defaultEventChannel = await interaction.guild.channels.fetch(value)
                if(!defaultEventChannel){
                    return Promise.reject('Unable to find selected channel!');
                }
                await checkChannelPermissions(defaultEventChannel, ['ViewChannel']);
                dbGuild.raidHelper.eventChannelId = interaction.values[0];
                return ['saveGuild', 'update'];

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