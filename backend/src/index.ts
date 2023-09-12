import Bot from './bot';
import { config } from 'dotenv';
import { install } from 'source-map-support';
import logger from '../lib/logger';
import { OAuth2Scopes, PermissionFlagsBits } from 'discord.js';
import { RespawnInterval } from './common/respawnInterval';
import Database from './db/database';
install();
config();


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
        RespawnInterval.startInterval(bot.client);
    })
    .catch((error) => {
        logger.error('Unable to start!');
        logger.error(error);
        process.exit(0);
    });


