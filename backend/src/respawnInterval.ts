import { Client } from 'discord.js';
import audioManager from './handlers/audioManager';
import raidhelperIntegration, { RaidhelperIntegration } from './raidhelperIntegration';
import textManager from './handlers/textManager';



export class RespawnInterval {
    public static startInterval(client: Client): void {
        setInterval(() => {
            audioManager.interval();
            textManager.interval();
            RaidhelperIntegration.interval(client);
        }, 1000);
    }
}