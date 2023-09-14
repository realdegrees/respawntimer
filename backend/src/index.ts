import Bot from './bot';
import { config } from 'dotenv';
import { install } from 'source-map-support';
import logger from '../lib/logger';
import { OAuth2Scopes, PermissionFlagsBits } from 'discord.js';
import { RespawnInterval } from './common/respawnInterval';
import Database from './db/database';
import { getAllGuilds } from './db/guild.schema';
import { DBGuild } from './common/types/dbGuild';
import { cleanGuilds } from './db/clean';
install();
config();

const logStats = (guildsDb: DBGuild[]): void => {
    logger.info('Total Guilds in Database: ' + guildsDb.length + '\n- ' + guildsDb.map((guild) => guild.name).join('\n- ') + '\n');
    logger.info('Recently Active Guilds in Database: ' + guildsDb.filter((guild) =>
        guild.lastActivityTimestamp && Date.now() - guild.lastActivityTimestamp < 1000 * 60 * 60 * 24 * 5).length);
    logger.info('Guilds with active Raidhelper Integration in Database: ' + guildsDb.filter((guild) =>
        guild.raidHelper.apiKey && guild.raidHelper.enabled).length);
    logger.info('Guilds with Custom Respawn Timings in Database: ' + guildsDb.filter((guild) =>
        guild.customTimings).length);
};

Promise.resolve()
    .then(() => Database.init())
    .then(() => Bot.init())
    .then((bot) => {
        logger.info('Invite | ' + bot.user?.client.generateInvite({
            scopes: [OAuth2Scopes.Bot, OAuth2Scopes.ApplicationsCommands],
            permissions: [
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.Speak,
                PermissionFlagsBits.ViewChannel]
        }));
        return bot;
    })
    .then((bot) => {
        // If cleanup fails it gets logged, no need to await
        getAllGuilds()
            .then((guilds) => {
                logStats(guilds);
                return cleanGuilds(bot.client, guilds);
            })
            .then((guildsCleaned) => logger.info('Guild Cleanup: ' + guildsCleaned.length + '\n- ' + guildsCleaned.join('\n- ')))
            .catch(logger.error);
        RespawnInterval.startInterval(bot.client);
    }).catch((error) => {
        logger.error('Unable to start!');
        logger.error(error);
        process.exit(0);
    });


