import { Client } from 'discord.js';
import audioManager from '../util/audioManager';
import raidhelperIntegration from '../raidhelperIntegration';
import textManager from '../util/textManager';
import { getRespawnInfo } from '../util/util';



export class RespawnInterval {
    public static startInterval(client: Client): void {
        setInterval(() => {
            const data = getRespawnInfo();
            audioManager.interval(data);
            textManager.interval(data);
            raidhelperIntegration.interval(data, client);
        }, 1000);
    }
}