import Bot from './bot';
import Firebase from '../lib/firebase';
import { config } from 'dotenv';
import { install } from 'source-map-support';
import logger from '../lib/logger';
import { ping } from './triggers/ping.trigger';
install();
config();


Promise.resolve()
    .then(() => Firebase.init())
    .then((db) => Bot.init(db))
    .then((bot) => {
        logger.info('Bot started successfully');
        bot.use([
            ping
        ]);
    })
    .catch((error) => {
        logger.error('The bot is unable to start!');
        logger.error(error);
        process.exit(0);
    });


