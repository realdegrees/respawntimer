import { GuildBasedChannel, PermissionResolvable } from 'discord.js';


export const checkChannelPermissions = (channel: GuildBasedChannel, permissions: PermissionResolvable[]): Promise<void> => {
    permissions.forEach((permission) => {
        if (!channel.permissionsFor(channel.client.user)?.has(permission)) {
            return Promise.reject(`Missing *${permission}* permission in ${channel}`);
        }
    });
    return Promise.resolve();
};