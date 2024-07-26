import { Client } from 'discord.js';
import { Widget } from './common/widget';

export class WidgetHandler {
    public static WIDGETS : Widget[] = []; // in-memory widgets
    public constructor(client: Client) {
        client.on('messageDelete', (message) => {
            const widgetIndex = WidgetHandler.WIDGETS.findIndex((widget) => widget.getId() === message.id);
            if(widgetIndex !== -1){
                if(!WidgetHandler.WIDGETS[widgetIndex].isResetting){
                    WidgetHandler.WIDGETS.splice(widgetIndex, 1);
                }
            }
        });
    }
}
