import {
    ActionRowBuilder, AnySelectMenuInteraction, ButtonBuilder, ButtonInteraction, ButtonStyle,
    CacheType,
    ChannelSelectMenuBuilder, ChannelSelectMenuInteraction, ChannelType, Emoji, Guild, Interaction, MessageComponentInteraction, ModalBuilder, ModalSubmitInteraction, RoleSelectMenuBuilder, TextInputBuilder, TextInputStyle, VoiceBasedChannel
} from 'discord.js';
import { ESettingsID, BaseSetting } from './base.setting';
import { checkChannelPermissions } from '../../util/permissions';
import { DBGuild } from '../types/dbGuild';
import Database from '../../db/database';
import logger from '../../../lib/logger';
import { Widget } from '../widget';
import { SettingsPostInteractAction } from '../types/settingsPostInteractActions';
import { setTimeout } from 'timers/promises';
import { RaidhelperIntegration } from '../../raidhelperIntegration';

export enum ERaidhelperSettingsOptions {
    API_KEY = 'apikey',
    DEFAULT_CHANNEL = 'defaultchannel',
    EVENT_CHANNEL = 'eventchannel',
    TOGGLE_AUTO_VOICE = 'toggleautovoice',
    TOGGLE_AUTO_WIDGET = 'toggleautowidget',
    REFRESH_EVENTS = 'refreshevents'
}
const MANUAL_REFRESH_INTERVAL = 1000 * 60 * 10;
export class RaidhelperSettings extends BaseSetting<ButtonBuilder | ChannelSelectMenuBuilder> {
    public constructor() {
        super(ESettingsID.RAIDHELPER,
            'Raidhelper Integration (Experimental)',
            `Wartimer now integrates with Raidhelper to automatically connect to a channel when an event scheduled by *Raidhelper* starts.\n
            Set the API Key below and toggle Auto-Join to enable *Raidhelper Integration*\n`,
            'Wartimer will connect to the voice channel specified in the Raidhelper event.\nIf no event is set it will use the default voice channel set below.');
    }

    public getSettingsRows(dbGuild: DBGuild, interaction: ButtonInteraction | ModalSubmitInteraction | AnySelectMenuInteraction) {
        const apiKeyButton = new ButtonBuilder({
            custom_id: this.getCustomId(this.id, [ERaidhelperSettingsOptions.API_KEY]),
            label: 'Set API Key',
            style: dbGuild.raidHelper.apiKeyValid ? ButtonStyle.Secondary : ButtonStyle.Primary,
            disabled: !!dbGuild.raidHelper.apiKeyValid
        });
        const timeSinceLastManualRefreshMs = dbGuild.raidHelper.lastManualRefresh ? Date.now() - dbGuild.raidHelper.lastManualRefresh.getTime() : Infinity;
        const canRefresh = timeSinceLastManualRefreshMs > MANUAL_REFRESH_INTERVAL;
        const refreshButton = new ButtonBuilder({
            custom_id: this.getCustomId(this.id, [ERaidhelperSettingsOptions.REFRESH_EVENTS]),
            label: canRefresh ? 'Refresh Events' : 'Refresh Available in ' + `${Math.floor((MANUAL_REFRESH_INTERVAL - timeSinceLastManualRefreshMs) / 1000 / 60 + 1)}m`,
            style: dbGuild.raidHelper.apiKeyValid ? ButtonStyle.Secondary : ButtonStyle.Primary,
            disabled: !canRefresh && !!dbGuild.raidHelper.apiKey
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
            .addComponents(apiKeyButton)
            .addComponents(refreshButton);
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
                return `- 📝  ${event.title.length > 20 ? `${event.title.slice(0, 19)}..` : event.title}  ${time}${voiceChannel ? `  🔗 ${voiceChannel} ${voiceChannelPermissions}` : ''}`;
            }))).join('\n') : '*None*';

        const apiKeyValidText = apiKey ?
            apiKeyValid ?
                ' » *Valid Key* ✅' :
                ' » *Last Request Failed* ⚠️' :
            '';
        const apiKeyText = apiKey ?
            '||```fix\n' + apiKey + '```||' :
            `Use \`/apikey show\` to retrieve your Raidhelper API Key  
                Or \`/apikey refresh\` if you don't have an API Key\n\`\`\`diff\n- Not Set\`\`\``;
        const apiKeyInvalidInfo = !apiKeyValid ? 'Try the refresh button below.\nIf it does not validate your API Key use `/apikey refresh`\nto get a new API Key and enter it again.\n' : ''

        const eventChannel = guildData.raidHelper.eventChannelId ?
            await guild.channels.fetch(guildData.raidHelper.eventChannelId).catch(() => undefined) : undefined;
        const eventChannelText = eventChannel && eventChannel.isTextBased() ? await checkChannelPermissions(eventChannel, ['ViewChannel'])
            .then(() => `${eventChannel}`)
            .catch((reason) => `${eventChannel} ⚠️ ${reason}`) :
            `${'```diff\n- Not Set ```'}*Events from all channels will be scheduled*`;

        return `**Raidhelper API Key** ${apiKeyValidText}  
        ${apiKeyText}${apiKeyInvalidInfo}
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
        **Scheduled Events**${(scheduledEvents.includes('⚠️') ? ' ≫ *Missing Some Permissions*' : '')}  
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
    ): Promise<SettingsPostInteractAction[]> {
        if (!interaction.guild) return Promise.reject('Unable to complete request! Cannot retrieve server data');
        const guild = interaction.guild;
        switch (option) {
            case ERaidhelperSettingsOptions.API_KEY:
                if (!interaction.isButton()) return Promise.reject('Interaction ID mismatch, try resetting the bot in the toptions if this error persists.');
                await this.showModal(interaction);
                const modalInteraction = await interaction.awaitModalSubmit({ time: 1000 * 60 * 2 })
                const apiKey = modalInteraction.fields
                    .getTextInputValue(this.getCustomId(
                        ESettingsID.RAIDHELPER,
                        [ERaidhelperSettingsOptions.API_KEY]
                    ));
                dbGuild.raidHelper.apiKey = apiKey;
                return await RaidhelperIntegration.updateEventStatus(guild, dbGuild)
                    .then(async () => {
                        await modalInteraction.deferUpdate();
                        return ['saveGuild', 'update'] as SettingsPostInteractAction[];
                    })
                    .catch(async () => {
                        await modalInteraction.reply({ ephemeral: true, content: 'Invalid API Key.\nTry using `/apikey refresh` to get a new key.' })
                            .then(() => setTimeout(1000 * 20))
                            .then(() => interaction.deleteReply())
                            .catch(logger.error);
                        return [];
                    })
                break;
            case ERaidhelperSettingsOptions.DEFAULT_CHANNEL:
                if (!interaction.isChannelSelectMenu()) return Promise.reject('Interaction ID mismatch, try resetting the bot in the toptions if this error persists.');
                const defaultVoiceChannel = await interaction.guild.channels.fetch(interaction.values[0])
                if (!defaultVoiceChannel?.isVoiceBased()) {
                    return Promise.reject('Invalid Channel');
                } else {
                    await checkChannelPermissions(defaultVoiceChannel, ['ViewChannel', 'Connect', 'Speak']);
                    dbGuild.raidHelper.defaultVoiceChannelId = interaction.values[0];
                    return ['saveGuild', 'update'];
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
                return ['saveGuild', 'update'];
            case ERaidhelperSettingsOptions.TOGGLE_AUTO_WIDGET:
                dbGuild.raidHelper.widget = !dbGuild.raidHelper.widget;
                return ['saveGuild', 'update'];
            case ERaidhelperSettingsOptions.REFRESH_EVENTS:
                dbGuild.raidHelper.lastManualRefresh = new Date();
                await RaidhelperIntegration.updateEventStatus(guild, dbGuild)
                    .catch(async () => {
                        dbGuild.raidHelper.apiKeyValid = false;
                        await dbGuild.save();
                    }).catch(logger.error);
                return ['update', 'saveGuild']; // widget gets updated in updateEventStatus
            default: return Promise.reject('Missing Options ID on Interaction. This should never happen');
        }
    }
}