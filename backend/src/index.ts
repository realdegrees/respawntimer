import './util/string.extensions';
import Bot from './bot';
import { config } from 'dotenv';
import { install } from 'source-map-support';
import logger from '../lib/logger';
import Database from './db/database';
import { INVITE_SETTINGS } from './commands/invite';
import { RaidhelperIntegration } from './raidhelperIntegration';
import { NotificationHandler } from './handlers/notificationHandler';
import { setTimeout } from 'timers/promises';
import { startInterval } from './handlers/intervalHandler';

install();
config();

Promise.resolve()
	.then(() => Database.init())
	.then(() => Bot.init())
	.then(async () => {
		//TODO: on startup fetch all guilds and cleanup DB depending on error codes https://discord.com/developers/docs/topics/opcodes-and-status-codes
		//TODO: add wrapper for channel.fetch, guild.fetch etc. that autoamtically cleans up DB entries depending on error codes
		// Log invite link
		logger.info('Invite | ' + Bot.client.generateInvite(INVITE_SETTINGS));

		// Remove discord servers from DB taht have been inactive or where bot is not a member anymore
		let dbGuilds = await Database.getAllGuilds();

		// Start polling interval for all guilds
		dbGuilds = await Database.getAllGuilds();
		for (const dbGuild of dbGuilds) {
			if (dbGuild.raidHelper.apiKey) {
				RaidhelperIntegration.start(dbGuild);
				await setTimeout(2000);
			}
		}

		RaidhelperIntegration.startRaidhelperMessageCollector();
		await NotificationHandler.startListening();

		// Start respawn interval
		startInterval();
	})
	.catch((error) => {
		logger.error('Unable to start!');
		logger.error(error);
		process.exit(0);
	});
