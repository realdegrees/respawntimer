import logger from '../../lib/logger';
import { debug, WAR_START_TIMES_MINUTES } from '../common/constant';
import { RaidhelperIntegration } from '../integrations/raidhelperIntegration';
import audioManager from './audioManager';
import textManager from './textManager';


export const startInterval = () => {
	const managers = [textManager, audioManager];
	setInterval(() => {
		const date = new Date();
		const [minutes, seconds] = [date.getMinutes(), date.getSeconds()];
		const warEnd = seconds === 0 && WAR_START_TIMES_MINUTES.some((t) => t === minutes);
		try {
			managers.forEach(async (manager) => {
				const subscribers = await manager.populatedSubscribers();
				manager.update(subscribers.map((subscriber) => ({ ...subscriber, warEnd })));
			});
			RaidhelperIntegration.interval();
		} catch (e) {
			logger.error('[FATAL] Something went wrong in the interval!', e);
		}
	}, 1000);
};
