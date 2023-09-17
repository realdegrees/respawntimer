import { Client } from 'discord.js';
import { Widget } from './common/widget';
import textManager from './util/textManager';

export class WidgetHandler {
    public static WIDGETS : Widget[] = []; // in-memory widgets
    public constructor(client: Client) {
        client.on('messageDelete', (message) => {
            const widgetIndex = WidgetHandler.WIDGETS.findIndex((widget) => widget.getId() === message.id);
            if(widgetIndex !== -1){
                if(!WidgetHandler.WIDGETS[widgetIndex].isResetting){
                    const [widget] = WidgetHandler.WIDGETS.splice(widgetIndex, 1);
                    textManager.unsubscribe(widget.getId(), true);
                }
            }
        });
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
