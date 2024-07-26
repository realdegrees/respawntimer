import { Client } from 'discord.js';
import { DBGuild } from '../common/types/dbGuild';
import { deleteGuild } from './guild.schema';
import logger from '../../lib/logger';

/**
 * @returns deleted guilds
 */
export const cleanGuilds = async (client: Client, guilds: DBGuild[]): Promise<string[]> => {
    return client.guilds.fetch().then((clientGuilds) => Promise.all(guilds.map((dbGuild) => {
        const guild = clientGuilds.find((guild) => guild.id === dbGuild.id);
        if (guild) {
            if (dbGuild.lastActivityTimestamp) {
                const inactiveDurationDays = (Date.now() - dbGuild.lastActivityTimestamp) / 1000 / 60 / 60 / 24;
                logger.info(`[${dbGuild.name}] Last Activity ${(inactiveDurationDays * 24).toFixed(2)} hours ago`);
                if (inactiveDurationDays > 48) {
                    return deleteGuild(dbGuild.id).then(() => `${dbGuild.name} (Inactive ${inactiveDurationDays}d)`);
                } else {
                    return Promise.resolve();
                }
            } else {
                return Promise.resolve();
            }
        } else {
            return deleteGuild(dbGuild.id).then(() => dbGuild.name);
        }
    }))).then((guildsStates) => guildsStates.filter((state) => !!state) as string[]);
};