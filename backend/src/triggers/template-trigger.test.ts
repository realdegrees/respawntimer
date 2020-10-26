import { MockClient } from '../../lib/discord-mock';
import logger from '../../lib/logger';
import { getSampleTriggerCommand } from '../common/util';
import { templateTrigger } from './template-trigger';

describe('Template Trigger', () => {
    let client: MockClient;
    let command: string;
    beforeAll(async () => {
        try {
            client = await MockClient.connect();
        } catch (error) {
            logger.error(
                `Mock client could not be initialized! 
                Does the bot have the "MANAGE_CHANNELS" permission on your test server?`
            );
            throw error;
        }
        command = getSampleTriggerCommand(templateTrigger);
    });
    afterAll(async () => {
        await client.cleanup();
    });

    it('should complete check on simple command', async () => {
        const channel = await client.createTextChannel('', {
            
        });
        const message = await client.getMessage(channel, command, {
            reactions: [
                '🇪'
            ]
        });
        templateTrigger.patchOptions({
            channels: {
                include: [channel.id]
            },
            requiredPermissions: [],
            roles: {
                include: []
            },
            conditionCheck: undefined
        });
        expect(templateTrigger.check(message)).resolves.not.toBeTruthy();
    });
});
