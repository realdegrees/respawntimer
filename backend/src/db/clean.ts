import { Client, Colors } from 'discord.js';
import { DBGuild } from '../common/types/dbGuild';
import logger from '../../lib/logger';
import Database from './database';
import { NotificationHandler } from '../handlers/notificationHandler';

/**
 * @returns deleted guilds
 */
export const cleanGuilds = async (client: Client, guilds: DBGuild[]): Promise<string[]> => {
    return client.guilds.fetch().then((clientGuilds) => Promise.all(guilds.map(async (dbGuild) => {
        const guild = clientGuilds.find((guild) => guild.id === dbGuild.id);
        if (guild) {
            if (dbGuild.lastActivity) {
                const inactiveDurationDays = (Date.now() - dbGuild.lastActivity.getTime()) / 1000 / 60 / 60 / 24;
                logger.info(`[${dbGuild.name}] Last Activity ${(inactiveDurationDays * 24).toFixed(2)} hours ago`);
                if (inactiveDurationDays > 31) {
                    await guild.fetch().then((guild) =>
                        NotificationHandler.sendNotification(guild, dbGuild,
                            'Data Deletion',
                            'The bot has been inactive for a month on this server.\nAll saved data will be deleted, you can still use the bot at any time but will have to redo any settings.',
                            { color: Colors.DarkRed }
                        ))

                    return Database.deleteGuild(dbGuild.id).then(() => `${dbGuild.name} (Inactive ${inactiveDurationDays}d)`);
                } else {
                    return Promise.resolve();
                }
            } else {
                return Promise.resolve();
            }
        } else {
            logger.info(`[${dbGuild.name}] Server removed from DB as Bot is not present on server`);
            return Database.deleteGuild(dbGuild.id).then(() => dbGuild.name);
        }
    }))).then((guildsStates) => guildsStates.filter((state) => !!state) as string[]);
};