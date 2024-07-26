import {
    ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle,
    ChannelSelectMenuBuilder, ChannelType, Guild, ModalBuilder, TextInputBuilder, TextInputStyle, VoiceBasedChannel
} from 'discord.js';
import { getGuild } from '../../db/guild.schema';
import { ESettingsID, Setting } from './settings';
import raidhelperIntegration from '../../raidhelperIntegration';
import { checkChannelPermissions } from '../../util/checkChannelPermissions';
import { DBGuild } from '../types/dbGuild';

export enum ERaidhelperSettingsOptions {
    API_KEY = 'apikey',
    DEFAULT_CHANNEL = 'defaultchannel',
    EVENT_CHANNEL = 'eventchannel',
    TOGGLE_AUTO_VOICE = 'toggleautovoice',
    TOGGLE_AUTO_WIDGET = 'toggleautowidget'
}

export class RaidhelperSettings extends Setting {

    public async getCurrentSettings(guildData: DBGuild, guild: Guild): Promise<string> {
        const apiKey = guildData.raidHelper.apiKey;
        const apiKeyValid = apiKey ?
            await raidhelperIntegration.checkApiKey(guild, apiKey) : false;
        const events = await getGuild(guild)
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
            apiKeyValid ?
                '||```fix\n' + apiKey + '```||' :
                '```fix\n' + apiKey + '```' :
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
        **Scheduled Events**${(scheduledEvents.includes('⚠️') ? ' ≫ *Missing Some Permissions*' : '') || ' *(Updates every 10 minutes)*'}  
        ${scheduledEvents}`;
    }

    public constructor() {
        super(ESettingsID.RAIDHELPER);
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

        this.init(
            'Raidhelper Integration (Experimental)',
            `Wartimer now integrates with Raidhelper to automatically connect to a channel when an event scheduled by *Raidhelper* starts.\n
            Set the API Key below and toggle Auto-Join to enable *Raidhelper Integration*\n`,
            'Wartimer will connect to the voice channel specified in the Raidhelper event.\nIf no event is set it will use the default voice channel set below.',
            raidhelperEventChannelRow, defaultVoiceChannelRow, apiKeyRow);
    }

    public showModal(interaction: ButtonInteraction): Promise<void> {
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
}