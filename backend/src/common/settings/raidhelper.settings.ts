import {
    ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle,
    ChannelSelectMenuBuilder, ChannelType, Guild, ModalBuilder, TextInputBuilder, TextInputStyle, VoiceBasedChannel
} from 'discord.js';
import { GuildData, getGuild } from '../../db/guild.schema';
import { ESettingsID, Setting } from './settings';
import raidhelperIntegration from '../../raidhelperIntegration';
import { formatTime } from '../../util/formatTime';
import { checkChannelPermissions } from '../../util/checkChannelPermissions';
import { Document } from 'mongoose';
import { DBGuild } from '../types/dbGuild';

export enum ERaidhelperSettingsOptions {
    API_KEY = 'apikey',
    DEFAULT_CHANNEL = 'defaultchannel',
    EVENT_CHANNEL = 'eventchannel',
    TOGGLE = 'toggle'
}

export class RaidhelperSettings extends Setting {

    public async getCurrentSettings(guildData: DBGuild, guild: Guild): Promise<string> {
        const apiKey = guildData.raidHelper.apiKey;
        const apiKeyValid = apiKey ?
            await raidhelperIntegration.checkApiKey(guild, apiKey) : false;
        const events = await getGuild(guild)
            .then((dbGuild) => raidhelperIntegration.getEvents(dbGuild))
            .catch(() => []);

        const defaultChannel = guildData.raidHelper.defaultVoiceChannelId ?
            await guild.channels.fetch(guildData.raidHelper.defaultVoiceChannelId).catch() : undefined;
        const defaultChannelText = defaultChannel && defaultChannel.isVoiceBased() ? await checkChannelPermissions(defaultChannel, ['ViewChannel', 'Connect', 'Speak'])
            .then(() => `${defaultChannel}`)
            .catch((reason) => `${defaultChannel} ⚠️ ${reason}`) :
            `*None*`;

        const scheduledEvents = events.length > 0 ?
            (await Promise.all(events.map(async (event) => {
                const voiceChannel = event.voiceChannelId ?
                    await guild.channels.fetch(event.voiceChannelId).catch(() => undefined) as VoiceBasedChannel | undefined : undefined;
                const time = formatTime(new Date(event.startTime));
                const voiceChannelPermissions = voiceChannel && voiceChannel.isVoiceBased() ? await checkChannelPermissions(voiceChannel, ['ViewChannel', 'Connect', 'Speak'])
                    .then(() => '')
                    .catch(() => `⚠️`) : '';
                return `- 📝  ${event.title}  🕑  ${time}${voiceChannel ? `  🔗 ${voiceChannel} ${voiceChannelPermissions}` : ''}`;
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
            await guild.channels.fetch(guildData.raidHelper.eventChannelId).catch() : undefined;
        const eventChannelText = eventChannel && eventChannel.isTextBased() ? await checkChannelPermissions(eventChannel, ['ViewChannel'])
            .then(() => `${eventChannel}`)
            .catch((reason) => `${eventChannel} ⚠️ ${reason}`) :
            `${'```diff\n- Not Set ```'}*Events from all channels will be scheduled*`;

        return `**Raidhelper API Key** ${apiKeyValidText}  
        ${apiKeyText}
        **Events Channel**  
        ${eventChannelText}\n
        **Auto-Join**  
        ${guildData.raidHelper.enabled ? '```diff\n+ Enabled ```' : '```diff\n- Disabled ```'}
        **Default Voice Channel**  
        ${defaultChannelText}\n
        **Scheduled Events**${scheduledEvents.includes('⚠️') ? ' ≫ *Missing Some Permissions*' : ''}  
        ${scheduledEvents}`;
    }

    public constructor() {
        super(ESettingsID.RAIDHELPER);
        const apiKeyButton = new ButtonBuilder({
            custom_id: this.getCustomId(this.id, [ERaidhelperSettingsOptions.API_KEY]),
            label: 'Set API Key',
            style: ButtonStyle.Primary
        });
        const toggleButton = new ButtonBuilder({
            custom_id: this.getCustomId(this.id, [ERaidhelperSettingsOptions.TOGGLE]),
            label: 'Toggle Auto-Join',
            style: ButtonStyle.Secondary
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
            .addComponents(toggleButton);
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