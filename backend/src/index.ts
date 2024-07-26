import Bot from './bot';
import { config } from 'dotenv';
import { install } from 'source-map-support';
import logger from '../lib/logger';
import { RespawnInterval } from './common/respawnInterval';
import Database from './db/database';
import { DBGuild } from './common/types/dbGuild';
import { cleanGuilds } from './db/clean';
import { INVITE_SETTINGS } from './commands/invite';
import { Widget } from './common/widget';
import { RaidhelperIntegration } from './raidhelperIntegration';
import { NotificationHandler } from './handlers/notificationHandler';
import { MAX_INACTIVE_DAYS } from './common/constant';
install();
config();

const logStats = (guildsDb: DBGuild[]): void => {
    logger.info('Total Guilds in Database: ' + guildsDb.length + '\n- ' + guildsDb.map((guild) => guild.name).join('\n- ') + '\n');
    logger.info('Recently Active Guilds (3d): ' + guildsDb.filter((guild) => guild.lastActivity && Date.now() - guild.lastActivity.getTime() < 1000 * 60 * 60 * 24 * 3).length);
    logger.info('Guilds with Notifications enabled: ' + guildsDb.filter((guild) => guild.notificationChannelId).length);
    logger.info('Guilds with active Raidhelper Integration: ' + guildsDb.filter((guild) => guild.raidHelper.apiKey).length);
    logger.info('Guilds with Custom Respawn Timings: ' + guildsDb.filter((guild) => guild.customTimings).length);
};

Promise.resolve()
    .then(() => Database.init())
    .then(() => Bot.init())
    .then((bot) => {
        logger.info('Invite | ' + bot.user?.client.generateInvite(INVITE_SETTINGS));
        return bot;
    })
    .then(async (bot) => {
        // Remove discord servers from DB taht have been inactive or where bot is not a member anymore
        const dbGuilds = await Database.getAllGuilds();
        logStats(dbGuilds);
        const guildsCleaned = await cleanGuilds(bot.client, dbGuilds, MAX_INACTIVE_DAYS);
        guildsCleaned.forEach((clean) => logger.info(`[${clean.name}] ${clean.reason}`))
        
        RespawnInterval.startInterval(bot.client);
        RaidhelperIntegration.startListening(bot.client);
        await NotificationHandler.startListening(bot.client);
        await Widget.loadExisting(bot.client);
    }).catch((error) => {
        logger.error('Unable to start!');
        logger.error(error);
        process.exit(0);
    });


