import { Guild, GuildBasedChannel, PermissionResolvable, User } from 'discord.js';


export const checkChannelPermissions = async (channel: GuildBasedChannel, permissions: PermissionResolvable[]): Promise<void> => {
    for (const permission of permissions) {
        if (!channel.permissionsFor(channel.client.user)?.has(permission)) {
            return Promise.reject(`Missing *${permission}* permission in ${channel}`);
        }
    }
    return Promise.resolve();
};
export const userHasRole = async (guild: Guild, user: User, permittedRoleIDs: string[]): Promise<boolean> => {
    return guild.members.fetch(user)
        .then((member) => member.roles.cache.some((userRole) => permittedRoleIDs.includes(userRole.id)) ||
            member.permissions.has('Administrator') ||
            user.id === process.env['OWNER_ID']);
}