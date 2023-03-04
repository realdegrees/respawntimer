import logger from '../../lib/logger';
import audioManager from '../audioManager';
import textManager from '../textManager';
import { getRespawnInfo } from './util';



export class RespawnInterval {
    public static startInterval(): void {
        setInterval(() => {
            const data = getRespawnInfo();

            audioManager.interval(data);
            textManager.interval(data);
        }, 1000);
    }
}