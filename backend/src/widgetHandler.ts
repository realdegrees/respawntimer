import { Client } from 'discord.js';
import { Widget } from './common/widget';
import textManager from './util/textManager';
import Database from './db/database';
import logger from '../lib/logger';

export class WidgetHandler {
    public static WIDGETS: Widget[] = []; // in-memory widgets
    public constructor(client: Client) {
        client.on('messageDelete', (message) => {
            const widgetIndex = WidgetHandler.WIDGETS.findIndex((widget) => widget.getId() === message.id);
            if (widgetIndex !== -1) {
                if (!WidgetHandler.WIDGETS[widgetIndex].isResetting) {
                    const [widget] = WidgetHandler.WIDGETS.splice(widgetIndex, 1);
                    textManager.unsubscribe(widget.getId(), true);
                    if (message.guild) {
                        Database.getGuild(message.guild)
                            .then((dbGuild) => {
                                dbGuild.widget.channelId = undefined;
                                dbGuild.widget.messageId = undefined;
                                return dbGuild.save();
                            })
                            .catch(logger.error);
                    }
                }
            }
        });

        // Populate
        Database.queryGuilds({
            'widget.messageId': { $exists: true }
        }).then(async (dbGuilds) => {
            const clientGuilds = await client.guilds.fetch();
            for (const dbGuild of dbGuilds) {
                const clientGuild = await clientGuilds.find((clientGuild) => clientGuild.id === dbGuild.id)?.fetch().catch(() => undefined);
                const widget = await Widget.get({
                    guild: clientGuild,
                    channelId: dbGuild.widget.channelId,
                    messageId: dbGuild.widget.messageId
                });
                await widget?.update({ force: true });
            }
        }).catch(logger.error);
    }
    public static removeWidgetFromMemory(id: string): void {
        const widgetIndex = WidgetHandler.WIDGETS.findIndex((widget) => widget.getId() === id);
        if (widgetIndex !== -1) {
            if (!WidgetHandler.WIDGETS[widgetIndex].isResetting) {
                const [widget] = WidgetHandler.WIDGETS.splice(widgetIndex, 1);
                textManager.unsubscribe(widget.getId(), true);
            }
        }
    }
}
