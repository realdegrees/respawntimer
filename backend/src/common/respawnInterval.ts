import audioManager from '../util/audioManager';
import textManager from '../util/textManager';
import { getRespawnInfo } from '../util/util';



export class RespawnInterval {
    public static startInterval(): void {
        setInterval(() => {
            const data = getRespawnInfo();

            audioManager.interval(data);
            textManager.interval(data);
        }, 1000);
    }
}