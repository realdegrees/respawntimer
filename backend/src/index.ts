import Bot from './bot';
import Firebase from '../lib/firebase';
import { config } from 'dotenv';
import { install } from 'source-map-support';
import logger from '../lib/logger';
import { ping } from './triggers/ping.trigger';
import { configureTrigger } from './triggers/configure.trigger';
import { helpTrigger } from './triggers/help.trigger';
import { depositTrigger } from './triggers/deposit.trigger';
import { withdrawTrigger } from './triggers/withdraw.trigger';
install();
config();


Promise.resolve()
    .then(() => Firebase.init())
    .then((db) => Bot.init(db))
    .then((bot) => {
        bot.use([
            ping,
            configureTrigger,
            helpTrigger,
            depositTrigger,
            withdrawTrigger
        ]);
    })
    .then(() => logger.info('Bot started successfully'))
    .catch((error) => {
        logger.error('The bot is unable to start!');
        logger.error(error);
        process.exit(0);
    });


