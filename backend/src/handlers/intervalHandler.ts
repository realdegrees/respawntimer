import logger from '../../lib/logger';
import { RaidhelperIntegration } from '../raidhelperIntegration';
import audioManager from './audioManager';
import textManager from './textManager';

const WAR_START_TIMES_MINUTES = [0, 30];

export const startInterval = () => {
	const managers = [textManager, audioManager];
	setInterval(() => {
		const date = new Date();
		const [minutes, seconds] = [date.getMinutes(), date.getSeconds()];
		const warEnd = seconds === 0 && WAR_START_TIMES_MINUTES.some((t) => t === minutes);
		try {
			RaidhelperIntegration.interval();
			managers.forEach(async (manager) => {
				const subscribers = await manager.populatedSubscribers();
				manager.update(subscribers.map((subscriber) => ({ ...subscriber, warEnd })));
			});
		} catch (e) {
			logger.error('[FATAL] Something went wrong in the interval!', e);
		}
	}, 1000);
};
