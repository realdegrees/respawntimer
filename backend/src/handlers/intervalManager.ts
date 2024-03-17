import logger from '../../lib/logger';
import { DBGuild } from '../common/types/dbGuild';
import Database from '../db/database';
import { RaidhelperIntegration } from '../raidhelperIntegration';
import { Widget } from '../widget';

const WAR_START_TIMES_MINUTES = [0, 30];

type SubscribedTimestamp = number;
export type Subscriber = {
	dbGuild: DBGuild;
	time: {
		subscribedTimestamp: number;
		subscribedForMs: number;
	};
	widget?: Widget;
};
export type TimeInfo = {
	warEnd: boolean;
};
export type UnsubscribeReason = 'Manual' | 'War End' | 'No Voiceconnection' | 'No Widget';
export abstract class IntervalManager<
	SubscriberExtension extends Record<Exclude<string, keyof Subscriber>, any> = {}
> {
	private _subscribers: Record<string, SubscribedTimestamp> = {};
	private static _subscribers: Set<string> = new Set();
	public constructor(
		private updateExtension: keyof SubscriberExtension extends never
			? void
			: Required<{
					[K in keyof SubscriberExtension]: (
						id: string
					) => SubscriberExtension[K] | Promise<SubscriberExtension[K]>;
			  }>
	) {}

	public static start(managers: (IntervalManager<any> | IntervalManager)[]): void {
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
	}

	public abstract update(subscribers: (Subscriber & SubscriberExtension & TimeInfo)[]): void;

	private async populatedSubscribers(): Promise<(Subscriber & SubscriberExtension)[]> {
		return (
			await Promise.allSettled<Subscriber & SubscriberExtension>(
				Object.entries(this._subscribers).map(
					([guildId, subscribedTimestamp]) =>
						new Promise<Subscriber & SubscriberExtension>(async (res, rej) => {
							const dbGuild = await Database.getGuild(guildId);
							const widget = await Widget.find(dbGuild);
							const subscriber: Subscriber = {
								dbGuild,
								time: {
									subscribedTimestamp,
									subscribedForMs: Date.now() - subscribedTimestamp
								},
								widget
							};

							// Fill extended props
							const extended: SubscriberExtension = {} as SubscriberExtension;
							if (typeof this.updateExtension === 'object') {
								for (const key in this.updateExtension) {
									extended[key] = await this.updateExtension[key](guildId);
								}
							}

							res({ ...subscriber, ...extended });
						})
				)
			)
		)
			.filter(
				// Filters out the rejected promises (subscribers that were unsubscibred due to missing widget)
				(res): res is PromiseFulfilledResult<Awaited<Subscriber & SubscriberExtension>> =>
					res.status === 'fulfilled'
			)
			.map(({ value: subscriber }) => subscriber);
	}
	public async subscribe(guildId: string, ...props: unknown[]): Promise<() => Promise<void>> {
		this._subscribers[guildId] = Date.now();
		IntervalManager._subscribers.add(guildId);
		return this.unsubscribe.bind(this, guildId);
	}
	public async unsubscribe(guildId: string, reason?: UnsubscribeReason): Promise<void> {
		const subscribedTimestamp: number | undefined = this._subscribers[guildId];
		const { name } = await Database.getGuild(guildId);
		logger.info(
			`[${name}] Ending subscription ${reason ? `(${reason})` : ''}(Lasted ${(
				(Date.now() - subscribedTimestamp) /
				1000 /
				60
			).toFixed(1)}m)`
		);
		delete this._subscribers[guildId];
		IntervalManager._subscribers.delete(guildId);
	}
}
