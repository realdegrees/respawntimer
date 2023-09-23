import Bot from './bot';
import { config } from 'dotenv';
import { install } from 'source-map-support';
import logger from '../lib/logger';
import { Permissions } from 'discord.js';
install();
config();


Promise.resolve()
    //.then(() => Firebase.init())
    .then(() => Bot.init())
    .then((bot) => logger.info('Bot started successfully | ' + bot.user?.client.generateInvite({
        scopes: ['bot', 'applications.commands'],
        permissions: [
            Permissions.FLAGS.SEND_MESSAGES,
            Permissions.FLAGS.SPEAK,
            Permissions.FLAGS.VIEW_CHANNEL]
    })))
    .catch((error) => {
        logger.error('The bot is unable to start!');
        logger.error(error);
        process.exit(0);
    });


