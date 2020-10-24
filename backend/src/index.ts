import Bot from './bot';
import Firebase from '../lib/firebase';
import { config } from 'dotenv';
import { Trigger, TriggerMatch } from './common/types';
import { install } from 'source-map-support';
import logger from '../lib/logger';
install();
config();

Promise.all([
    Bot.init(),
    Firebase.init()
])
    .then(() => {
        logger.info('Bot started successfully');
        Bot.use([
            /**
             * This is a sample trigger to show how triggers work
             * add more triggers to this parameter array to add functionality to the bot
             */
            new Trigger((message) => {
                message.channel.send('Henlo');
            }, {
                commandOptions: {
                    command: 'henlo',
                    match: TriggerMatch.CONTAINS
                },
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                conditionCheck: (message, options) => {
                    return new Promise((resolve, reject) => {
                        const timePosted = new Date(message.createdTimestamp);
                        // If the command was written between 3pm and 9pm
                        // the bot will answer, else the bot will ignore the command
                        const isAllowed = timePosted.getHours() < 21 && timePosted.getHours() >= 3;
                        return isAllowed ? resolve() : reject('I only answer between 3pm and 9pm');
                    });

                }
            })
        ]);
    })
    .catch((error) => {
        logger.error('The bot is unable to start!');
        logger.error(error);
        process.exit(0);
    });


