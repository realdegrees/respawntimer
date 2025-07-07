import logger from '../../lib/logger';
import { DBGuild } from '../common/types/dbGuild';
import Database from '../db/database';
import { Widget } from '../widget';


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
export abstract class Manager<
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

	public abstract update(subscribers: (Subscriber & SubscriberExtension & TimeInfo)[]): void;

	public async populatedSubscribers(): Promise<(Subscriber & SubscriberExtension)[]> {
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
		Manager._subscribers.add(guildId);
		return this.unsubscribe.bind(this, guildId);
	}
	public async unsubscribe(guildId: string, reason?: UnsubscribeReason): Promise<void> {
		const subscribedTimestamp: number | undefined = this._subscribers[guildId];
		const { name } = await Database.getGuild(guildId);
		logger.debug(
			`[${name}] Ending subscription ${reason ? `(${reason})` : ''}(Lasted ${(
				(Date.now() - subscribedTimestamp) /
				1000 /
				60
			).toFixed(1)}m)`
		);
		delete this._subscribers[guildId];
		Manager._subscribers.delete(guildId);
	}
}
