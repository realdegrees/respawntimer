import { TestClient } from 'djs-test-client';
import { pong } from './pong.reaction';
import { ping } from '../triggers/ping.trigger';
import { getSampleTriggerCommand } from '../common/util';

describe('Pong Reaction', () => {
    let client: TestClient;
    beforeAll(async () => {
        client = await TestClient.connect();
    });
    afterAll(async () => {
        await client.destroy();
    });

    it('should send pong command', async () => {
        const channel = await client.createTextChannel();
        const input = await client.sendMessage(channel, getSampleTriggerCommand(ping));
        await pong.run(input);
        const message = (await client.getMessages(channel, 1))[0];
        expect(message).toBeTruthy();
        expect(message.content).toEqual('pong');
    });
});