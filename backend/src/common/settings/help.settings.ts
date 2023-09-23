import { ActionRowBuilder, AnySelectMenuInteraction, ButtonBuilder, ButtonInteraction, ButtonStyle, CacheType, EmbedBuilder, Interaction, ModalSubmitInteraction } from 'discord.js';
import { ESettingsID, BaseSetting } from './base.setting';
import { DBGuild } from '../types/dbGuild';
import Database from '../../db/database';
import logger from '../../../lib/logger';
import { Widget } from '../../widget';
import { NotificationHandler, UPDATE_SOURCE_SERVER_ID } from '../../handlers/notificationHandler';
import { EPHEMERAL_REPLY_DURATION_LONG, EPHEMERAL_REPLY_DURATION_SHORT, EXCLAMATION_ICON_LINK, WARN_ICON_LINK, WARTIMER_ICON_LINK, debug } from '../constant';
import { SettingsPostInteractAction } from '../types/settingsPostInteractActions';
import { setTimeout } from 'timers/promises';

export enum EHelpSettingsOptions {
    CLEAR = 'clear',
    CLEAR_CONFIRM = 'clearconfirm'
}
const emptyField = {
    name: ' ',
    value: ' '
};
export class HelpSettings extends BaseSetting<ButtonBuilder> {
    private showConfirmButton = false;
    public constructor() {
        super(ESettingsID.HELP,
            ButtonStyle.Success,
            [new EmbedBuilder()
                .setAuthor({ iconURL: WARTIMER_ICON_LINK, name: 'Respawn Timer' })
                .setThumbnail(WARTIMER_ICON_LINK)
                .setTitle('Helpful Resources')
                .setFields([{
                    name: `<:forumbadge:1153001819069493330> Discord Support Server`,
                    value: `https://discord.gg/tcvd8CsA4N\n*Join the support server to receive help if steps below don't work*`
                }, emptyField, {
                    name: `<:github:1153001600391065630> Github`,
                    value: `https://github.com/realdegrees/respawntimer\n*Check out the README for an in-depth guide on all features*`
                }]),
            new EmbedBuilder()
                .setAuthor({ iconURL: WARTIMER_ICON_LINK, name: 'Respawn Timer' })
                .setThumbnail(WARN_ICON_LINK)
                .setTitle('Troubleshooting')
                .setFields([{
                    name: '<:RaidHelper:1044417248196055080> Raidhelper Integration',
                    value: 'If your API key is showing as invalid then it may have been **rate-limited**. ' +
                        'Try using the **Raidhelper** command `/apikey refresh` to get a new API key and set it in the **Raidhelper Integration** settings.'
                }, emptyField, {
                    name: '🔒 Permission Issues',
                    value: 'If the bot is does not join a voice channel check the settings. If there are any **missing permissions** they will be displayed there. ' +
                        'Make sure the bot has `View`, `Connect` and `Speak` permissions in **every voice channel** you want it to be able to join.'
                }, emptyField, {
                    name: '<a:loading:393852367751086090> Widget Unresponsive',
                    value: 'If the widget stops updating even though the text button is on then the bot hit some form of rate-limit.\n' +
                        '**Server specific rate-limits** can happen from time to time but will be resolved after a few seconds and the widget continues.\n'+
                        'If the rate-limit is imposed on the **IP of the bot** then all widgets will stop updating *globally*. There should not be enough users yet to hit this limit.\n' + 
                        'If this limit ever gets reached the bot will have to draw back on some features like updating the text widget in 1s intervals.'
                }, emptyField, {
                    name: '❓ Errors',
                    value: 'If you are receiving **internal errors** as responses from the bot try **resetting** your data with the button below.\n' +
                        'You will have to re-do all your settings but it might fix the issue.\n**If the issues persist please seek help in the support discord.**'
                }])]
        );
    }

    // ! dbGuild can be an empty object here 
    public async getSettingsRows(dbGuild: DBGuild, interaction: ButtonInteraction | ModalSubmitInteraction | AnySelectMenuInteraction) {
        const clear = new ButtonBuilder()
            .setCustomId(this.getCustomId(this.id, [EHelpSettingsOptions.CLEAR]))
            .setLabel('Clear Saved Data')
            .setStyle(ButtonStyle.Danger);

        if (this.showConfirmButton || !(await Database.hasGuild(dbGuild.id))) {
            clear.setDisabled(true);
        }
        const confirmClear = new ButtonBuilder()
            .setCustomId(this.getCustomId(this.id, [EHelpSettingsOptions.CLEAR_CONFIRM]))
            .setLabel('Confirm')
            .setStyle(ButtonStyle.Success);

        const delRow = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(clear);

        if (this.showConfirmButton) {
            delRow.addComponents(confirmClear);
        }
        this.showConfirmButton = false;
        return Promise.resolve([delRow]);
    }
    public async getCurrentSettings() {
        return '';
    }
    public async onInteract(
        dbGuild: DBGuild,
        interaction: ButtonInteraction | ModalSubmitInteraction | AnySelectMenuInteraction,
        widget: Widget | undefined,
        option: string
    ): Promise<SettingsPostInteractAction[]> {
        if (!interaction.isButton()) return Promise.reject('Internal Error');
        if (!interaction.guild) return Promise.reject('Unable to complete request! Cannot retrieve server data');
        switch (option) {
            case EHelpSettingsOptions.CLEAR:
                this.showConfirmButton = true;
                // Don't await so the buttons get updated immediately
                interaction.reply({ ephemeral: true, content: '❗Careful❗\nThis will reset all settings to default and delete your existing widgets!' })
                    .then(() => setTimeout(EPHEMERAL_REPLY_DURATION_SHORT * 5))
                    .then(() => interaction.deleteReply())
                    .catch(logger.error);
                return ['update'];
                break;
            case EHelpSettingsOptions.CLEAR_CONFIRM:
                if (interaction.guild.id === UPDATE_SOURCE_SERVER_ID && !debug) return Promise.reject('Data cannot be deleted on this server.');
                await NotificationHandler.sendNotification(interaction.guild, dbGuild, 'Data Deletion', `${interaction.user} just deleted all data for this server.\nIf this was not intentional you will have to redo your settings!`)
                return ['update', 'deleteGuild'];
                break;
            default: return Promise.reject('Missing Options ID on Interaction. This should never happen');
        }
    }
}