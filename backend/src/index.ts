import Bot from './bot';
import { config } from 'dotenv';
import { Trigger, TriggerMatch } from './common/types';
import { install } from 'source-map-support';
install();
config();


/**
 * This is a sample trigger to show how triggers work
 */
Bot.use(new Trigger((message) => {
    message.channel.send('I only answer from 3pm to 9pm')
}, {
    commandOptions: {
        content: 'bot',
        matchType: TriggerMatch.CONTAINS
    },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    conditionCheck: (message, options) => {
        const timePosted = new Date(message.createdTimestamp);
        // If the command was written between 3pm and 9pm, the bot will answer, else the bot will ignore the command
        const isAllowed = timePosted.getHours() > 21 && timePosted.getHours() >= 3;
        return Promise.resolve(!isAllowed);
    }
}));

Bot.start();