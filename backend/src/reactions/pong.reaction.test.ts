import { TestClient } from 'djs-test-client';
import { pong } from './pong.reaction';
import { ping } from '../triggers/ping.trigger';
import { getSampleTriggerCommand } from '../common/util';
import { GuildMessage } from '../common/reaction';

describe('Pong Reaction', () => {
    let client: TestClient;
    beforeAll(async () => {
        client = await TestClient.connect();
    });
    afterAll((done) => {
        client.destroy()
            .then(done)
            .catch(done);
    });

    it('should send pong command', async () => {
        const channel = await client.createTextChannel();
        const content = await getSampleTriggerCommand(ping, client.guild);
        const input = await client.sendMessage(
            channel,
            content
        ) as GuildMessage;
        await pong.run(input);
        const message = (await client.getMessages(channel, 1))[0];
        expect(message).toBeTruthy();
        expect(message.content).toEqual('pong');
    });
});