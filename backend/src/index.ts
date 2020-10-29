import Bot from './bot';
import Firebase from '../lib/firebase';
import { config } from 'dotenv';
import { Trigger, TriggerMatch } from './common/types';
import { install } from 'source-map-support';
import logger from '../lib/logger';
import { templateTrigger } from './triggers/template-trigger';
import { Reaction } from './common/reaction';
install();
config();


Promise.resolve()
    .then(() => Firebase.init())
    .then((db) => Bot.init(db))
    .then((bot) => {
        logger.info('Bot started successfully');
        bot.use([
            /**
             * This is a sample trigger to show how triggers work
             * add more triggers to this parameter array to add functionality to the bot
             */
            templateTrigger,
            new Trigger([
                new Reaction(() => {
                    return Promise.resolve();
                })
            ], {
                commandOptions: {
                    command: 'configure',
                    match: TriggerMatch.EQUALS
                },
                requiredPermissions: [
                    'MANAGE_GUILD'
                ]
            })
        ]);
    })
    .catch((error) => {
        logger.error('The bot is unable to start!');
        logger.error(error);
        process.exit(0);
    });


