import { Client, Colors } from 'discord.js';
import { DBGuild } from '../common/types/dbGuild';
import logger from '../../lib/logger';
import Database from './database';
import { NotificationHandler } from '../handlers/notificationHandler';

/**
 * @returns deleted guilds
 */
export const cleanGuilds = async (client: Client, dbGuilds: DBGuild[], maxInactiveDays: number): Promise<{
    name: string;
    reason: string;
}[]> => {
    const results: {
        name: string;
        reason: string;
    }[] = [];
    const clientGuilds = await client.guilds.fetch();
    for (const dbGuild of dbGuilds) {
        try {
            const clientGuild = clientGuilds.find((guild) => guild.id === dbGuild.id);
            if (!clientGuild) {
                // Delete guild if bot cannot find the discord server
                await Database.deleteGuild(dbGuild.id);
                results.push({
                    name: dbGuild.name,
                    reason: `Bot not on Server`
                });
            }
            else if (clientGuild && dbGuild.lastActivity) {
                // Delete guild if bot has not been interacted with for the specified duration
                const inactiveDurationDays = (Date.now() - dbGuild.lastActivity.getTime()) / 1000 / 60 / 60 / 24;
                logger.info(`[${dbGuild.name}] Last Activity ${(inactiveDurationDays * 24).toFixed(2)} hours ago`);
                if (inactiveDurationDays > maxInactiveDays) {
                    const guild = await clientGuild.fetch();
                    await NotificationHandler.sendNotification(dbGuild,
                        'Data Deletion',
                        'The bot has been inactive for a month on this server.\nAll saved data will be deleted, you can still use the bot at any time but will have to redo any settings.',
                        { color: Colors.DarkRed }
                    )
                    await Database.deleteGuild(dbGuild.id);
                    results.push({
                        name: dbGuild.name,
                        reason: `Inactive for ${inactiveDurationDays}d`
                    });
                }
            }
        } catch (e) {
            logger.error(e?.toString?.() || `Error trying check cleaning state for ${dbGuild.name}`)
            continue;
        }
    }
    return results;
};