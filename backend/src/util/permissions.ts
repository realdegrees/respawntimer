import { Guild, GuildBasedChannel, PermissionResolvable, User } from 'discord.js';
import logger from '../../lib/logger';

export const checkChannelPermissions = async (
	channel: GuildBasedChannel,
	permissions: PermissionResolvable[]
): Promise<void> => {
	const missing: PermissionResolvable[] = [];
	for (const permission of permissions) {
		if (!channel.permissionsFor(channel.client.user)?.has(permission)) {
			missing.push(permission);
		}
	}

	return missing.length
		? Promise.reject(
				`Missing permission${missing.length > 1 ? 's' : ''} in ${channel}\n*${missing.join(', ')}*`
		  )
		: Promise.resolve();
};
export const userHasRole = async (
	guild: Guild,
	user: User,
	permittedRoleIDs: string[]
): Promise<boolean> => {
	return guild.members
		.fetch(user)
		.then(
			(member) =>
				member.roles.cache.some((userRole) => permittedRoleIDs.includes(userRole.id)) ||
				member.permissions.has('Administrator') ||
				user.id === process.env['OWNER_ID']
		)
		.catch((e) => {
			// If we can't fetch the member, default to checking if they're the owner
			logger.warn(`Failed to fetch member ${user.id} from guild ${guild.id}: ${e}`);
			return user.id === process.env['OWNER_ID'];
		});
};
